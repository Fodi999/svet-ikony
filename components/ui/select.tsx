'use client';
import {Select as SelectPrimitive} from '@base-ui/react/select';
import {Check,ChevronDown} from 'lucide-react';
import {cn} from '@/lib/utils';
import styles from './select.module.css';

export type SelectOption<V extends string>={value:V;label:string};
type Props<V extends string>={
  value:V;options:readonly SelectOption<V>[];onChange:(value:V)=>void;
  'aria-label':string;
  /** Text before the value inside the trigger (e.g. "Year"); the list shows bare labels. */
  prefix?:string;
  size?:'sm'|'md';className?:string;disabled?:boolean;
};
/**
 * The site's select: the same dark glass and gold as the rest of the UI on
 * every platform, instead of the browser's native popup. Keyboard, typeahead
 * and screen-reader behaviour come from Base UI's Select.
 */
export function Select<V extends string>({value,options,onChange,prefix,size='md',className,disabled,...props}:Props<V>){
  const items=options.map(option=>({value:option.value,label:option.label}));
  return <SelectPrimitive.Root items={items} value={value} onValueChange={next=>{if(next!==null)onChange(next as V);}} disabled={disabled} modal={false}>
    <SelectPrimitive.Trigger aria-label={props['aria-label']} className={cn(styles.trigger,styles[size],className)} data-site-select>
      {prefix?<span className={styles.prefix}>{prefix}</span>:null}
      <SelectPrimitive.Value className={styles.value}/>
      <SelectPrimitive.Icon className={styles.icon}><ChevronDown size={size==='sm'?14:16}/></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner className={styles.positioner} sideOffset={6} alignItemWithTrigger={false} align="end">
        <SelectPrimitive.Popup className={styles.popup}>
          <SelectPrimitive.List className={styles.list}>
            {items.map(item=><SelectPrimitive.Item key={item.value} value={item.value} className={styles.item}>
              <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
              <SelectPrimitive.ItemIndicator className={styles.indicator}><Check size={15}/></SelectPrimitive.ItemIndicator>
            </SelectPrimitive.Item>)}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}
