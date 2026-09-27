import {describe,it,expect} from 'vitest';
import {markerPublication,type MarkerPublication} from './marker-publication';
const saint:MarkerPublication={ownerId:'saint:group',entityId:'place:anchor',placeId:null,versionId:'v1',markerKey:'media/marker.png',panelKey:'media/panel.png'};
const place:MarkerPublication={...saint,ownerId:'place:anchor',entityId:null,placeId:'anchor'};
describe('stable marker publication mapping',()=>{
 it('resolves static saint markers by the same entity ID as the CMS link',()=>expect(markerPublication([saint],'place:anchor','anchor')).toBe(saint));
 it('resolves church markers by place ID',()=>expect(markerPublication([place],null,'anchor')).toBe(place));
 it('does not match missing IDs to null fields',()=>expect(markerPublication([place],null,null)).toBeUndefined());
 it('keeps an explicitly withdrawn saint image instead of substituting the place photo',()=>{const withdrawn={...saint,versionId:null,markerKey:null,panelKey:null};expect(markerPublication([place,withdrawn],'place:anchor','anchor')).toBe(withdrawn);});
 it('does not match titles or unrelated identifiers',()=>expect(markerPublication([saint],'another','another')).toBeUndefined());
});
