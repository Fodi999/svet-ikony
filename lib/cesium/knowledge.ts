export type KnowledgeLayerKind='country'|'border'|'capital'|'city'|'saint'|'church'|'monastery'|'event'|'historical-territory'|'nature';
export interface KnowledgeLayer {
  readonly id:string;
  readonly kind:KnowledgeLayerKind;
  setVisible(visible:boolean):void;
  labelBoxes?():{x:number;y:number;w:number}[];
  dispose():void;
}
/** Future city data stays outside the MVP; no mass import is performed here. */
export interface CityLayer extends KnowledgeLayer {
  readonly kind:'city';
  setDetail(detail:'far'|'medium'|'close'):void;
}
export class KnowledgeLayerManager {
  private layers=new Map<string,KnowledgeLayer>();
  private visibility=new Map<string,boolean>();
  add(layer:KnowledgeLayer){if(this.layers.has(layer.id))throw new Error(`Duplicate knowledge layer: ${layer.id}`);this.layers.set(layer.id,layer);layer.setVisible(this.visibility.get(layer.id)??true);}
  setVisible(id:string,visible:boolean){this.visibility.set(id,visible);this.layers.get(id)?.setVisible(visible);}
  snapshot(){return [...this.layers.keys()].map(id=>({id,visible:this.visibility.get(id)??true}));}
  dispose(){for(const layer of this.layers.values())layer.dispose();this.layers.clear();}
}
