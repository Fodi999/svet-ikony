import {expect,it,vi} from 'vitest';
import {KnowledgeLayerManager} from './knowledge';
it('owns visibility and disposal without duplicate registrations',()=>{
 const manager=new KnowledgeLayerManager(),layer={id:'capitals',kind:'capital' as const,setVisible:vi.fn(),dispose:vi.fn()};
 manager.add(layer);expect(()=>manager.add(layer)).toThrow();manager.setVisible('capitals',false);expect(layer.setVisible).toHaveBeenCalledWith(false);
 manager.dispose();manager.dispose();expect(layer.dispose).toHaveBeenCalledOnce();
});
