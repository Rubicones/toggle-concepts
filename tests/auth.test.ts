import assert from "node:assert/strict";
import test from "node:test";
import { magicLinkRedirectUrl, magicLinkRequestSchema, magicLinkVerifySchema, signInDestination } from "../packages/data/auth";

test("magic-link requests cannot carry signup, identity, type or redirect overrides", () => {
  assert.ok(magicLinkRequestSchema.safeParse({email:"client@toggle.local"}).success);
  for (const fields of [{redirectTo:"https://foreign.example"},{shouldCreateUser:true},{userId:"forged"}]) assert.equal(magicLinkRequestSchema.safeParse({email:"client@toggle.local",...fields}).success,false);
  assert.equal(magicLinkVerifySchema.safeParse({tokenHash:"a".repeat(64),type:"recovery"}).success,false);
  assert.equal(magicLinkVerifySchema.safeParse({tokenHash:"<script>"}).success,false);
});
test("email destinations require a configured origin; role landing comes only from memberships", () => {
  assert.equal(magicLinkRedirectUrl("http://127.0.0.1:3100"),"http://127.0.0.1:3100/auth/callback");
  assert.equal(magicLinkRedirectUrl("https://studio.example"),"https://studio.example/auth/callback");
  for (const value of [undefined,"http://studio.example","https://user:secret@studio.example","https://studio.example/other","https://studio.example?next=elsewhere","javascript:alert(1)"]) assert.throws(()=>magicLinkRedirectUrl(value));
  assert.equal(signInDestination([{role:"producer"}]),"/workspace");
  assert.equal(signInDestination([{role:"art_director"}]),"/workspace");
  assert.equal(signInDestination([{role:"client"}]),"/portal");
  assert.equal(signInDestination(null),"/portal");
});
