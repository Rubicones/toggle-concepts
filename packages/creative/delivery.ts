export type CreativeFile={objectKey:string;sha256:string;mime:string;bytes:number};
export type DraftDelivery={version:'creative-delivery@1';variantId:string;programHash:string;mp4:CreativeFile;contactStrip:CreativeFile};
export type DeliveryView={state:'pending'|'rendering'|'ready'|'failed';variantId?:string;programHash?:string;mp4Url?:string;contactStripUrl?:string;reason?:string};
