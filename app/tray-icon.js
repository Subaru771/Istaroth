'use strict';
// PNG created locally using only built-in Node APIs. No remote fonts or third-party icon library.
const zlib=require('node:zlib');
const BITMAP={0:['111','101','101','101','111'],1:['010','110','010','010','111'],2:['111','001','111','100','111'],3:['111','001','111','001','111'],4:['101','101','111','001','001'],5:['111','100','111','001','111'],6:['111','100','111','101','111'],7:['111','001','001','001','001'],8:['111','101','111','101','111'],9:['111','101','111','001','111']};
function crc32(buffer){let c=0xffffffff;for(const x of buffer){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(name,data){const n=Buffer.alloc(4);n.writeUInt32BE(data.length);const label=Buffer.from(name);const tail=Buffer.alloc(4);tail.writeUInt32BE(crc32(Buffer.concat([label,data])));return Buffer.concat([n,label,data,tail]);}
function trayPng(amount,cap=200,stale=false){const w=32,h=32;const pixels=Buffer.alloc(w*h*4);
 const val=Number.isFinite(amount)?Math.min(500,Math.max(0,Math.trunc(amount))):null;
 const ratio=val===null?0:val/Math.max(1,cap);
 const bright=stale?[148,142,142]:val===null?[127,136,147]:ratio>=1?[246,169,80]:ratio>=.8?[240,197,94]:[112,204,176];
 const draw=(x,y,r,g,b,a=255)=>{if(x<0||x>=w||y<0||y>=h)return;const k=(y*w+x)*4;pixels[k]=r;pixels[k+1]=g;pixels[k+2]=b;pixels[k+3]=a;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const d=Math.hypot(x-15.5,y-15.5);if(d<15)draw(x,y,16,32,44,255);if(d>=12&&d<14.5)draw(x,y,55,70,79);if(d>=12&&d<14.5&&ratio>0){const angle=(Math.atan2(y-15.5,x-15.5)*180/Math.PI+450)%360;if(angle<ratio*360)draw(x,y,...bright);}}
 const value=val===null?'—':String(val),scale=value.length===3?2:3,width=value.length*4*scale-scale;const x0=Math.round((32-width)/2),y0=value.length===3?12:10;
 if(val===null){for(let x=12;x<20;x++)for(let y=16;y<18;y++)draw(x,y,234,225,196);}
 else for(let i=0;i<value.length;i++){const rows=BITMAP[value[i]];if(!rows)continue;for(let y=0;y<5;y++)for(let x=0;x<3;x++)if(rows[y][x]==='1')for(let yy=0;yy<scale;yy++)for(let xx=0;xx<scale;xx++)draw(x0+i*4*scale+x*scale+xx,y0+y*scale+yy,245,241,221);}
 const raw=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++)pixels.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);
 const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
module.exports={trayPng};
