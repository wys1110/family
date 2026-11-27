/* Seven little paper-theatre scenes. All positions are on a 720 × 450 stage. */
(() => {
  const paletteUrl = new URL('pigments.json', document.currentScript.src);
  async function loadArtwork() {
    const response = await fetch(paletteUrl);
    if (!response.ok) return false;
    const pigments = await response.json();
    if (!pigments || typeof pigments.outlineInk !== 'string') return false;
    window.drawStoryFrame = makeRenderer(pigments);
    return true;
  }
  window.miloArtworkReady = loadArtwork().catch(() => false);

  function makeRenderer(pigments) {
    const ink = pigments.outlineInk;
    const paleSkin = pigments.skinLight;
    const skin = pigments.skinPeach;
    const hair = pigments.hairUmber;
    const gold = pigments.shirtGold;
    const cream = pigments.shirtCream;
    const blue = pigments.sockBlue;
    const navy = pigments.sockOutline;
    const teal = pigments.trouserTeal;
    const shapes = new Map();
    const clamp = n => Math.max(0, Math.min(1, n));
    const mix = (a,b,t) => a + (b-a)*t;
    function ease(t, start=0, end=1) {
      const n=clamp((t-start)/(end-start));
      return n*n*(3-2*n);
    }
    function path(source) {
      if (!shapes.has(source)) shapes.set(source, new Path2D(source));
      return shapes.get(source);
    }
    function paint(c, source, fill, edge=null, width=1.9) {
      const shape = typeof source === 'string' ? path(source) : source;
      if (fill) { c.fillStyle=fill; c.fill(shape); }
      if (edge) { c.strokeStyle=edge; c.lineWidth=width; c.stroke(shape); }
    }
    function ellipse(c,x,y,rx,ry,fill,angle=0) {
      c.beginPath(); c.ellipse(x,y,rx,ry,angle,0,Math.PI*2);
      c.fillStyle=fill; c.fill();
    }
    function stroke(c,source,color,width=1.8) { paint(c,source,null,color,width); }
    const skinGrad=c=>{const g=c.createLinearGradient(-42,-44,55,47);g.addColorStop(0,pigments.skinHighlight);g.addColorStop(.62,paleSkin);g.addColorStop(1,skin);return g;};
    const swatch=(c,clip,draw)=>{c.save();c.clip(path(clip));draw();c.restore();};
    let paperTexture;
    function grain(c) {
      if (!paperTexture && typeof document!=='undefined') {
        const tile=document.createElement('canvas'); tile.width=tile.height=82;
        const brush=tile.getContext('2d'); let seed=215;
        const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
        for(let i=0;i<1800;i++) {
          brush.fillStyle = i%3 ? pigments.paperFleckLight : pigments.paperFleckShadow;
          brush.fillRect(random()*82,random()*82,random()*1.45+.4,random()*.85+.35);
        }
        paperTexture=tile;
      }
      if(paperTexture){c.fillStyle=c.createPattern(paperTexture,'repeat');c.fillRect(0,0,720,450);}
    }
    function room(c) {
      c.fillStyle=pigments.nurseryPlaster; c.fillRect(0,0,720,450);
      const img=window.storyRoomImage;
      if(img && (img.naturalWidth || img.width) && img.complete!==false) {
        const w=img.naturalWidth || img.width, h=img.naturalHeight || img.height;
        const s=Math.max(720/w,450/h);
        c.drawImage(img,(720-w*s)/2,(450-h*s)/2,w*s,h*s);
      } else {
        c.fillStyle=pigments.nurseryFloor; c.fillRect(0,274,720,176);
        stroke(c,'M0 278Q338 271 720 278',pigments.baseboardSeam,2);
      }
    }
    function rug(c) {
      ellipse(c,340,353,211,34,pigments.rugShadow);
      ellipse(c,335,349,215,32,pigments.rugBorder,-.014);
      ellipse(c,335,346,212,30,pigments.rugGround,-.014);
      for(let i=1;i<5;i++){
        c.beginPath();c.ellipse(335,346,210-i*8,30-i*1.57,-.014,0,Math.PI*2);
        c.strokeStyle=i%2?pigments.rugWeaveDark:pigments.rugWeaveLight;c.lineWidth=i%2?1.2:2;c.stroke();
      }
      for(let i=0;i<16;i++){
        const y=331.5+i*2;const x=335-211*Math.sqrt(Math.max(0,1-((y-346)/30)**2));
        c.beginPath();c.moveTo(x+3,y);c.lineTo(x-4-(i%4),y+1.5);c.strokeStyle=pigments.rugFringe;c.lineWidth=1.4;c.stroke();
      }
    }
    function basketBack(c) {
      ellipse(c,485,341,72,10,pigments.basketFloorShadow);
      paint(c,'M410 255Q405 244 422 236C453 222 516 225 547 235Q564 243 558 257C526 275 442 276 410 255Z',pigments.wickerRimUnder,pigments.wickerRimOutline,2.6);
      ellipse(c,484,246,69,14,pigments.basketInterior);
      paint(c,'M423 248Q431 233 447 240Q452 233 463 236L479 248Q452 258 423 248Z',pigments.linenFold,pigments.linenSeam,1.1);
      paint(c,'M495 249Q505 231 523 242Q535 239 547 249L527 253Z',pigments.linenPeach,null);
    }
    const basketFace='M410 251C442 265 523 268 558 249L546 321C541 345 438 350 424 328Q415 295 410 251Z';
    function basketFront(c){
      paint(c,basketFace,pigments.wickerGround,pigments.wickerOutline,2.7);
      swatch(c,basketFace,()=>{
        for(let k=-2;k<17;k++){
          const x=403+k*11;
          c.beginPath();c.moveTo(x,255);c.quadraticCurveTo(x+2,299,x+8,342);
          c.strokeStyle=k%2?pigments.wickerUprightDark:pigments.wickerUprightLight;c.lineWidth=4;c.stroke();
        }
        for(let i=0;i<8;i++){
          const y=259+10*i;
          for (let j=0;j<14;j++){
            const x=409+j*12+(i%2)*6;
            const dip=(xx)=>8*(1-((xx-484)/76)**2);
            const p=new Path2D();p.moveTo(x,y+dip(x));p.quadraticCurveTo(x+7,y+dip(x+7)-1.3,x+13,y+dip(x+13));
            paint(c,p,null,j%2?pigments.wickerWeftLight:pigments.wickerWeftDark,4.3);
          }
        }
      });
      stroke(c,'M409 252Q477 275 559 250',pigments.wickerEdgeShadow,8);
      stroke(c,'M410 249Q480 270 558 248',pigments.wickerEdgeLight,5.1);
      stroke(c,'M429 328Q484 341 544 322',pigments.wickerHem,3);
    }
    const scalp='M-62 2C-69-13-65-33-58-46C-64-59-47-76-32-80C-27-92-4-97 12-89C22-94 40-89 47-78C63-78 76-64 71-49Q78-42 69-33Q64-23 48-20Q54-33 48-42C42-29 29-25 17-26Q26-36 25-44C14-32 0-25-15-23Q-14-11-22-3Q-27 5-36 5L-49 20Q-62 18-62 2Z';
    const face='M-49-36C-45-72 22-82 49-52C65-33 57-13 67-4Q75 5 62 9C62 28 47 43 23 47C-6 53-35 36-43 15C-63 18-71-2-59-11Q-53-15-47-10Z';
    function drawHead(c,look,brow,blink,smile){
      paint(c,face,skinGrad(c),ink,2.6);
      paint(c,'M-58-7Q-50-10-47-1Q-54-5-54 3L-50 7',null,pigments.earFold,1.8);
      swatch(c,face,()=>{
        ellipse(c,43,14,13,5.8,pigments.cheekBlush,-.07);
        ellipse(c,-18,13,8,4.5,pigments.cheekWash);
        for(const [x,y] of [[36,12],[42,15],[47,11],[-17,10]])ellipse(c,x,y,1,1,pigments.freckles);
      });
      paint(c,scalp,hair,pigments.hairOutline,2.7);
      paint(c,'M-58-16Q-65-39-47-56Q-52-42-47-36Q-45-53-27-68Q-33-55-33-50Q-19-69 1-74C19-86 47-75 58-58Q48-79 27-82Q-4-97-29-78Q-56-73-62-48Z',pigments.hairChestnut);
      stroke(c,'M-50-48Q-45-66-26-71M-18-74Q-8-82 7-81M14-63Q26-75 37-69M42-59Q52-61 57-54',pigments.hairHighlight,2.15);
      stroke(c,'M-37-29Q-31-44-24-48M-11-35Q3-44 8-54',pigments.hairStrand,1.65);
      const gaze=look*2;
      c.save();c.translate(0,brow);stroke(c,'M2-21Q8-25 14-21M37-22Q44-26 50-22',pigments.eyebrow,2.5);c.restore();
      for(const [x,y] of [[10,-9],[45,-10]]){
        if(blink>.7) {stroke(c,'M'+(x-4)+' '+y+'q4 3 9 -1',pigments.closedEyelid,2.5);continue;}
        ellipse(c,x+gaze,y+.8+look*1.4,4.3,6.7*(1-blink*.72),pigments.pupil,.04);
        ellipse(c,x+gaze+1.4,y-1.8+look*1.4,1.1,1.5,pigments.eyeGlint);
      }
      stroke(c,'M29-8Q27 1 32 2Q34 3 36 1',pigments.noseContour,1.6);
      if(smile>.6) {paint(c,'M17 18Q29 25 43 16Q40 31 30 32Q21 31 17 18Z',pigments.mouthOpen,pigments.lipContour,1.2);paint(c,'M24 28Q30 25 36 27Q30 32 24 28Z',pigments.tongue);}
      else if(smile<.1)stroke(c,'M23 24Q30 19 35 22',pigments.concernedLip,2.1);
      else stroke(c,'M19 18Q29 27 41 17',pigments.smileLine,2.2);
    }
    const torso='M270 211Q281 204 295 204Q311 202 326 210Q346 213 350 232L343 267Q347 280 347 298Q311 315 251 297Q258 276 254 259Q247 237 254 225Q261 214 270 211Z';
    function shirt(c) {
      paint(c,torso,gold,ink,2.4);
      swatch(c,torso,()=>{
        for(let i=0;i<7;i++){
          const y=212+i*15;c.beginPath();c.moveTo(245,y);
          c.bezierCurveTo(269,y+11,318,y+12,354,y-3);
          c.strokeStyle=i%2?pigments.shirtStripeShadow:cream;c.lineWidth=7.2;c.stroke();
        }
        paint(c,'M253 231Q271 246 271 279L267 305L247 303Z',pigments.shirtSideWash);
        stroke(c,'M335 267Q330 279 332 288M259 286Q270 291 276 288',pigments.shirtFold,1.4);
      });
      paint(c,'M277 207Q290 216 310 202Q316 202 319 208Q298 228 275 213Z',pigments.shirtCollar,pigments.shirtCollarSeam,1.5);
      stroke(c,'M253 298Q299 310 345 298',pigments.shirtHem,3);
    }
    function leg(c,x,y,mirror) {
      c.save();c.translate(x,y);c.scale(mirror,1);
      const shape='M-11-58Q5-70 25-61Q46-51 59-41Q74-36 73-20Q69-7 47 0Q22 8 2 12L-10-10L26-25L8-28Q-12-30-18-40Z';
      paint(c,shape,teal,pigments.trouserOutline,2.4);
      paint(c,'M61-34Q66-21 47-14Q31-7 1-1L2 10Q34 5 57-6Q80-17 69-37Z',pigments.trouserShade);
      stroke(c,'M36-45Q53-46 58-38M44-14Q48-19 55-19M1-4L7 8',pigments.trouserStitch,1.4);
      paint(c,'M-11-8Q0-8 7 9L-1 15Q-5 6-17-3Z',pigments.trouserCuff,pigments.trouserCuffEdge,1.5);
      c.restore();
    }
    const foot='M-10-19Q0-21 11-14L12-4Q24 5 39 6Q51 8 51 16Q51 22 41 24Q19 26-3 19Q-13 15-14 5Z';
    const sock='M-13-21Q-3-24 12-18L14-4Q22 1 40 5Q52 8 53 16Q54 23 43 26Q17 28-5 21Q-16 17-16 4Z';
    function bareFoot(c) {
      paint(c,foot,paleSkin,pigments.heelOutline,1.9);
      stroke(c,'M45 11Q49 14 48 17M37 10Q42 13 41 16M-9 12Q-6 15 1 16',pigments.toeCrease,1.3);
      ellipse(c,34,12,11,5,pigments.toeWash);
    }
    function knit(c,hanging=false) {
      const shape=hanging?'M-15 0Q-4-4 12 0L14 31Q20 37 31 38Q44 41 44 52Q42 61 28 60L4 58Q-9 58-11 44Z':sock;
      paint(c,shape,blue,navy,2.1);
      swatch(c,shape,()=>{
        if(hanging) {
          for(let j=0;j<5;j++){const y=4+j*12;stroke(c,'M-20 '+y+'Q0 '+(y+5)+' 46 '+(y-5),pigments.sockStripeHanging,5);}
          paint(c,'M29 36Q21 47 25 64L47 65L51 40Z',pigments.sockToeHanging);
          paint(c,'M-18 34Q-1 31 1 42Q2 51-9 52Z',pigments.sockHeelHanging);
          paint(c,'M-17-2Q1 1 13-2L15 6Q-2 10-17 6Z',pigments.sockRibHanging);
          for(let x=-11;x<13;x+=5)stroke(c,'M'+x+' 1l.5 5',pigments.sockStitchHanging,1);
        } else {
          for(let j=0;j<5;j++){const x=0+j*12;stroke(c,'M'+x+' -23q-7 18 -14 47',pigments.sockStripe,5.2);}
          paint(c,'M39 1Q32 11 35 30L58 30V1Z',pigments.sockToe);
          paint(c,'M-19-4Q-5-4-4 8Q-5 16-14 16Z',pigments.sockHeel);
          paint(c,'M-15-23Q-2-27 14-19L14-10Q1-18-15-13Z',pigments.sockRib);
          for(let x=-11;x<10;x+=4)stroke(c,'M'+x+' -20l-1 6',pigments.sockStitch,1.1);
        }
      });
    }
    function drawFoot(c,x,y,mirror,sockOn,wiggle,toeFlex=0) {
      c.save();c.translate(x,y);c.rotate(wiggle*mirror);c.scale(mirror,1);
      if(sockOn && toeFlex){
        c.save();c.beginPath();c.rect(-28,-31,58,65);c.clip();knit(c);c.restore();
        c.save();c.translate(27,15);c.rotate(toeFlex);c.translate(-27,-15);
        c.beginPath();c.rect(27,-31,40,65);c.clip();knit(c);c.restore();
      } else if(sockOn)knit(c);else bareFoot(c);
      c.restore();
    }
    function sleeve(c,shoulder,elbow,hand,back=false){
      const sx=shoulder[0], sy=shoulder[1], ex=elbow[0], ey=elbow[1],hx=hand[0],hy=hand[1];
      const ang=Math.atan2(hy-ey,hx-ex);const wx=hx-Math.cos(ang)*13,wy=hy-Math.sin(ang)*13;
      const arm=new Path2D();
      arm.moveTo(sx,sy);arm.quadraticCurveTo(mix(sx,ex,.94),mix(sy,ey,.94),ex,ey);arm.quadraticCurveTo(mix(ex,wx,.46),mix(ey,wy,.46)+2,wx,wy);
      c.save();c.lineCap='round';
      paint(c,arm,null,back?pigments.backSleeveEdge:pigments.frontSleeveEdge,26);
      paint(c,arm,null,back?pigments.backSleeveGold:gold,23.2);
      c.lineCap='butt';c.setLineDash([6,12]);c.lineDashOffset=3;paint(c,arm,null,back?pigments.backSleeveCream:cream,22.5);c.restore();
      c.save();c.translate(hx,hy);c.rotate(ang);
      paint(c,'M-16-7Q-10-8-5-5Q1-9 7-8Q10-4 6-2Q13-4 15-1Q16 2 12 4Q15 7 10 9Q4 12-3 9L-16 5Z',paleSkin,pigments.handOutline,1.6);
      stroke(c,'M6 3Q9 3 12 2M4 7Q8 8 11 6',pigments.fingerFold,1.1);
      paint(c,'M-18-9L-11-9Q-7-1-12 8L-20 8Q-16 0-18-9Z',pigments.sleeveCuff,pigments.sleeveCuffEdge,1.1);
      c.restore();
    }
    function hangingSock(c,x,y,angle) {c.save();c.translate(x,y);c.rotate(angle);knit(c,true);c.restore();}
    function pinpoint(c,x,y,stretch,opacity){
      c.save();c.globalAlpha=opacity;c.translate(x,y);c.scale(stretch,stretch);
      stroke(c,'M-5-10l-4-8M4-12l2-8M11-6l7-5',pigments.discoveryMark,2.1);c.restore();
    }
    function poseFor(scene,t) {
      const step=ease(t,.06,.78), breath=Math.sin(t*Math.PI*2)*1.15;
      const pose={lean:.005,bob:breath,head:.055,look:0,smile:.55,brow:0,
        near:[258,281],ne:[235,260],far:[369,277],fe:[361,257]};
      switch(scene){
        case 0:
          pose.lean=mix(.13,.015,step);pose.head=mix(.13,-.015,step);pose.smile=mix(.4,.85,step);
          pose.far=[mix(459,400,step),mix(250,150,step)-Math.sin(t*Math.PI)*4];
          pose.fe=[mix(400,366,step),mix(258,223,step)];
          break;
        case 1:
          pose.lean=mix(.11,.24,step);pose.head=.24;pose.look=1;
          pose.far=[mix(410,359,step),mix(314,327,step)];pose.fe=[372,272];
          pose.near=[324+step*6,312];pose.ne=[268,281];break;
        case 2:
          pose.head=.22;pose.brow=1.2;pose.look=1;pose.smile=-.1;
          pose.near=[211,309];pose.ne=[232,276];break;
        case 3:
          pose.lean=mix(.04,.38,step);pose.head=mix(.03,.28,step);pose.look=1;pose.smile=.32;
          pose.far=[mix(384,471,step),mix(233,266,step)];pose.fe=[399,238];
          pose.near=[mix(259,395,step),mix(282,256,step)];pose.ne=[316+step*25,271];
          break;
        case 4:
          pose.lean=mix(.36,.04,step);pose.head=mix(.24,-.035,step);pose.smile=mix(.35,.9,step);
          pose.far=[mix(473,415,step),mix(268,149,step)];pose.fe=[mix(399,377,step),mix(238,219,step)];
          pose.near=[mix(392,262,step),mix(254,282,step)];pose.ne=[mix(341,236,step),270];
          break;
        case 5:
          pose.smile=.9;pose.head=-.045+Math.sin(Math.PI*t)*.09;pose.near=[231-mix(0,11,step),mix(267,287,step)];pose.ne=[239,261];pose.far=[mix(363,374,step),mix(260,287,step)];
          break;
        case 6:
          pose.smile=1;pose.look=1;pose.head=.12;break;
      }
      return pose;
    }
    function mapped(x,y,lean,bob){
      const dx=x-299,dy=y-301;
      return [299+dx*Math.cos(lean)-dy*Math.sin(lean),301+bob+dx*Math.sin(lean)+dy*Math.cos(lean)];
    }
    function child(c,scene,t){
      const pose=poseFor(scene,t),step=ease(t,.09,.76), swing=Math.sin(Math.PI*2*t);
      const blink=Math.max(0,1-Math.abs(t-.80)*23);
      const shiver=(scene===2 ? Math.sin(t*31)*Math.sin(Math.PI*t) : 0);
      const wiggle=(scene===6 ? Math.sin(t*15)*Math.sin(Math.PI*t) : 0);
      let xR=230+shiver*1.9,yR=330+shiver*1.2, xL=348,yL=333;
      if(scene===5){xR-=Math.sin(t*Math.PI)*4;xL+=Math.sin(t*Math.PI)*3;}
      ellipse(c,293,349,104,13,pigments.seatedShadow);
      paint(c,'M252 285Q295 280 341 285L355 308Q339 328 296 329Q253 329 239 312Z',teal,pigments.trouserWaist,2.2);
      leg(c,248,318,-1);leg(c,322,323,1);
      drawFoot(c,xR,yR,-1,scene>=5,shiver*.08+wiggle*.065,wiggle*.25);
      drawFoot(c,xL,yL,1,scene>=2,swing*.008-wiggle*.058,-wiggle*.23);
      if(scene===1){
        const toeAngle=mix(.34,0,step);
        c.save();c.translate(mix(398,xL,step),mix(351,yL,step));c.rotate(toeAngle);knit(c);c.restore();
      }
      if(scene===2){
        c.save();c.globalAlpha=.48+.25*Math.sin(t*14);
        stroke(c,'M171 314q-5-6-2-12m-5 18q-5-4-5-10',pigments.coldBreath,2);
        stroke(c,'M161 328q-7-1-10-6',pigments.coldBreath,1.7);c.restore();
      }
      const sFar=mapped(331,228,pose.lean,pose.bob);
      const sNear=mapped(265,231,pose.lean,pose.bob);
      c.save();c.translate(299,301+pose.bob);c.rotate(pose.lean);c.translate(-299,-301);
      paint(c,'M279 182L279 212Q293 227 313 208L311 178Z',skin,pigments.neckContour,1.6);
      shirt(c);
      c.save();c.translate(295,168);c.rotate(pose.head);drawHead(c,pose.look,pose.brow,blink,pose.smile);c.restore();c.restore();
      sleeve(c,sNear,pose.ne,pose.near,true);
      if(scene===0||scene===4){
        const ang=mix(.18,-.15,step)+swing*.055;
        hangingSock(c,pose.far[0]+6,pose.far[1]+5,ang);
      }
      sleeve(c,sFar,pose.fe,pose.far);
      if(scene===4 && step>.65)pinpoint(c,pose.far[0]+34,pose.far[1]+4,1,(step-.65)*2.2);
    }
    const cameras=[
      [1.08,369,219], [1.17,316,247], [1.92,290,335],
      [1.11,380,224], [1.09,374,218], [1.12,308,228], [1.97,292,337]
    ];
    function drawStoryFrame(c,sceneIndex,fraction) {
      const scene=Number.isInteger(sceneIndex)?Math.max(0,Math.min(6,sceneIndex)):0;
      const t=clamp(Number.isFinite(fraction)?fraction:0);
      const [zoom,cx,cy]=cameras[scene];
      c.save();c.lineJoin='round';c.lineCap='round';
      c.fillStyle=pigments.nurseryFloor;c.fillRect(0,0,720,450);
      c.save();c.translate(360,230);c.scale(zoom,zoom);c.translate(-cx,-cy);
      room(c);rug(c);basketBack(c);child(c,scene,t);basketFront(c);
      c.restore();grain(c);c.restore();
    }
    return drawStoryFrame;
  }
})();
