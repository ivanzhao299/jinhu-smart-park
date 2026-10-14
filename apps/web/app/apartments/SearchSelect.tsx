"use client";
import { useEffect,useRef,useState,type KeyboardEvent } from "react";
import { ChevronDown,Search } from "lucide-react";
import styles from "./ApartmentWorkbench.module.css";

export type SearchSelectOption={value:string;label:string;detail?:string;disabled?:boolean};

export function SearchSelect({value,options,loading,placeholder,searchPlaceholder,emptyText,onSearchChange,onSelect}:{
 value:string;
 options:SearchSelectOption[];
 loading:boolean;
 placeholder:string;
 searchPlaceholder:string;
 emptyText:string;
 onSearchChange:(keyword:string)=>void;
 onSelect:(value:string)=>void;
}){
 const [open,setOpen]=useState(false),[keyword,setKeyword]=useState(''),[highlight,setHighlight]=useState(0);
 const containerRef=useRef<HTMLDivElement>(null),searchRef=useRef<HTMLInputElement>(null),debounceRef=useRef<number|undefined>(undefined);
 const selected=options.find(option=>option.value===value)??null;
 useEffect(()=>{
  if(!open)return;
  const handleMouseDown=(event:MouseEvent)=>{if(!containerRef.current?.contains(event.target as Node))setOpen(false)};
  document.addEventListener("mousedown",handleMouseDown);
  searchRef.current?.focus();
  onSearchChange("");
  return ()=>document.removeEventListener("mousedown",handleMouseDown);
 },[open,onSearchChange]);
 useEffect(()=>()=>window.clearTimeout(debounceRef.current),[]);
 const handleSearch=(input:string)=>{
  setKeyword(input);
  window.clearTimeout(debounceRef.current);
  debounceRef.current=window.setTimeout(()=>onSearchChange(input),250);
 };
 const select=(option:SearchSelectOption)=>{
  if(option.disabled)return;
  onSelect(option.value);
  setOpen(false);
 };
 const handleKeyDown=(event:KeyboardEvent<HTMLInputElement>)=>{
  if(event.key==="Escape"){setOpen(false);return}
  if(event.key==="ArrowDown"){event.preventDefault();setHighlight(index=>Math.min(index+1,options.length-1));return}
  if(event.key==="ArrowUp"){event.preventDefault();setHighlight(index=>Math.max(index-1,0));return}
  if(event.key==="Enter"&&options[highlight]){event.preventDefault();select(options[highlight]!)}
 };
 return <div className={styles.picker} ref={containerRef}>
  <button type="button" className={styles.pickerInput} onClick={()=>{setHighlight(0);setOpen(isOpen=>!isOpen)}} aria-haspopup="listbox" aria-expanded={open}>
   <span className={selected?undefined:styles.pickerPlaceholder}>{selected?selected.label:placeholder}</span>
   <ChevronDown size={16} aria-hidden/>
  </button>
  {open?<div className={styles.pickerPanel}>
   <div className={styles.pickerSearch}>
    <Search size={14} aria-hidden/>
    <input ref={searchRef} value={keyword} onChange={event=>handleSearch(event.target.value)} onKeyDown={handleKeyDown} placeholder={searchPlaceholder} maxLength={100}/>
   </div>
   <div className={styles.pickerList} role="listbox">
    {loading?<p className={styles.pickerEmpty}>正在搜索…</p>
     :options.length?options.map((option,index)=><button type="button" key={option.value} role="option" aria-selected={option.value===value}
       className={`${styles.pickerOption} ${index===highlight?` ${styles.pickerOptionActive}`:''} ${option.disabled?` ${styles.pickerOptionDisabled}`:''}`}
       disabled={option.disabled} onMouseEnter={()=>setHighlight(index)} onClick={()=>select(option)}>
       <span>{option.label}</span>
       {option.detail?<small>{option.detail}</small>:null}
      </button>)
     :<p className={styles.pickerEmpty}>{emptyText}</p>}
   </div>
  </div>:null}
 </div>;
}
