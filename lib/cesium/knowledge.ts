export type KnowledgeLayerKind='capital'|'city'|'saint'|'church'|'monastery'|'event'|'historical-territory'|'nature';
export interface KnowledgeLayer {
  readonly id:string;
  readonly kind:KnowledgeLayerKind;
  setVisible(visible:boolean):void;
  dispose():void;
}
/** Future city data stays outside the MVP; no mass import is performed here. */
export interface CityLayer extends KnowledgeLayer {
  readonly kind:'city';
  setDetail(detail:'far'|'medium'|'close'):void;
}
export class KnowledgeLayerManager {
  private layers=new Map<string,KnowledgeLayer>();
  add(layer:KnowledgeLayer){if(this.layers.has(layer.id))throw new Error(`Duplicate knowledge layer: ${layer.id}`);this.layers.set(layer.id,layer);}
  setVisible(id:string,visible:boolean){this.layers.get(id)?.setVisible(visible);}
  dispose(){for(const layer of this.layers.values())layer.dispose();this.layers.clear();}
}
