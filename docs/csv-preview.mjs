/**
 * Client-side CSV quality preview, deliberately local and free.
 * Never persists or transmits uploaded content; no raw row values are shown.
 */
import {checkCsvByteLimit} from "./checkout-core.mjs";
export function parseCsv(text) {
  checkCsvByteLimit(text);
  const s=text.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");
  const rows=[]; let row=[],field="",quoted=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(quoted){
      if(c==='"'&&s[i+1]==='"'){field+='"';i++}
      else if(c==='"')quoted=false;
      else field+=c;
    } else if(c==='"'){
      if(field!=="") throw new Error("Unexpected quote inside an unquoted CSV cell.");
      quoted=true;
    } else if(c===","){
      row.push(field);field="";
    } else if(c==="\n"){
      row.push(field);rows.push(row);row=[];field="";
    } else field+=c;
  }
  if(quoted) throw new Error("Unclosed CSV quoted field; fix formatting locally.");
  if(row.length||field.length) {row.push(field);rows.push(row);}
  if(rows.length===0) throw new Error("No CSV rows detected.");
  if(rows.length>5000) throw new Error("Too many rows for a quick local preview.");
  return rows;
}
export function previewCsv(text) {
  const rows=parseCsv(text);
  const headers=rows[0].map(x=>x.trim());
  if(headers.length===0||headers.length>40||headers.some(x=>!x)) throw new Error("Header must contain 1–40 non-empty column names.");
  const data=rows.slice(1),width=headers.length;
  const counts={dataRows:data.length,columns:width,missingCells:0,irregularRows:0,duplicates:0,formulaRiskCells:0,headerDuplicates:0};
  counts.headerDuplicates=width-new Set(headers.map(x=>x.toLowerCase())).size;
  const seen=new Set();
  for(const row of data){
    if(row.length!==width)counts.irregularRows++;
    counts.missingCells+=Math.max(0,width-row.length)+row.filter(c=>c.trim()==="").length;
    for(const c of row){
      // Values beginning with =,+,-,@ can be dangerous in spreadsheet exports.
      if(/^[\s]*[=+@-]/.test(c))counts.formulaRiskCells++;
    }
    const key=JSON.stringify(row.map(c=>c.trim().toLowerCase()));
    if(seen.has(key))counts.duplicates++;else seen.add(key);
  }
  return {...counts,byteLength:new TextEncoder().encode(text).byteLength};
}
