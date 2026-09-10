// Parameterized rig poses. Actions select clips through tuning, not actor IDs.
const wave=(t,s=1)=>Math.sin(t*s),clamp=x=>Math.max(0,Math.min(1,x));
export const CLIPS=['idle','walk','run','sit','listen','write','draw','type','eat','eat-standing','drink','wash','sleep','toilet','guitar','basketball','water','teach','read-standing','pickup','give','inspect','open','greet','talk','microscope','experiment','clean','paint','piano','pingpong','stretch','argue'];
export function samplePose(clip,time=0){
 const t=time,p={bodyY:0,bodyZ:0,bodyX:0,headX:0,headY:0,arms:[0,0],armZ:[0,0],elbows:[0,0],legs:[0,0],knees:[0,0],prop:null,propY:0,propZ:0,jump:0};
 const seated=()=>{p.bodyY=.07;p.legs=[-1.48,-1.48];p.knees=[1.48,1.48];};
 const work=()=>{seated();p.arms=[-.75,-.75];p.elbows=[-.65,-.65];p.headX=.1;};
 if(['sit','listen','write','draw','type','eat','guitar','toilet'].includes(clip))seated();
 switch(clip){
  case 'walk':case 'run':{const k=clip==='run'?1.35:1,v=wave(t,8*k);p.legs=[v*.48,-v*.48];p.knees=[Math.max(0,-v)*.7,Math.max(0,v)*.7];p.arms=[-v*.4,v*.4];p.bodyY=Math.abs(v)*.035*k;p.bodyX=clip==='run'?.13:0;break;}
  case 'sleep':p.bodyX=-Math.PI/2;p.bodyY=.78;p.bodyZ=.8;p.arms=[-.1,-.1];p.headY=wave(t,1.2)*.025;break;
  case 'listen':p.headX=.025+wave(t,.7)*.025;p.headY=wave(t,.6)*.06;p.arms=[-.35,-.35];break;
  case 'write':case 'draw':work();p.arms[1]+=.09*wave(t,5);p.elbows[1]+=.15*wave(t,5);p.prop='pencil';break;
  case 'type':work();p.elbows=[-.5+.08*wave(t,9),-.5-.08*wave(t,9)];break;
  case 'eat':case 'eat-standing':p.arms=[-.55,-.65-.45*(wave(t,2)*.5+.5)];p.elbows=[-.7,-.7-.65*(wave(t,2)*.5+.5)];p.prop='spoon';p.headX=.08;break;
  case 'drink':p.arms[1]=-.9;p.elbows[1]=-1.2-.15*wave(t,2);p.prop='cup';p.headX=-.08;break;
  case 'wash':p.bodyX=.12;p.arms=[-.9,-.9];p.elbows=[-.35,-.35];p.armZ=[.07*wave(t,8),-.07*wave(t,8)];p.prop='water-stream';break;
  case 'guitar':p.arms=[-.65,-.55];p.elbows=[-.8,-.8+.18*wave(t,7)];p.armZ=[-.35,.2];p.prop='guitar';p.headY=.06*wave(t,2);break;
  case 'basketball':{const phase=(t%3)/3,shoot=clamp((phase-.4)*4);p.arms=[-.7-shoot*1.8,-.7-shoot*1.8];p.elbows=[-.5,-.5];p.jump=phase>.4&&phase<.8?Math.sin((phase-.4)/.4*Math.PI)*.15:0;p.prop='ball';p.propY=phase<.4?.45+Math.abs(wave(t,8))*.6:1.3+Math.sin((phase-.4)/.6*Math.PI)*2.2;p.propZ=phase<.4?.5:.5+(phase-.4)*3;break;}
  case 'water':p.arms[1]=-.75;p.elbows[1]=-.4;p.prop='watering-can';p.bodyX=.1;break;
  case 'teach':p.arms=[-.15,-1.3+.25*wave(t,1.7)];p.elbows[1]=-.35;p.headY=.2*wave(t,.7);p.prop='chalk';break;
  case 'read-standing':p.arms=[-.6,-.6];p.elbows=[-1,-1];p.prop='book';p.headX=.15;break;
  case 'pickup':p.bodyX=.65+wave(t,2)*.12;p.arms=[-.15,-.4];p.headX=.25;break;
  case 'inspect':p.bodyX=.2;p.headX=.1;p.headY=.2*wave(t,1.5);break;
  case 'open':p.arms[1]=-1.2;p.elbows[1]=-.3+.2*wave(t,2);break;
  case 'give':p.arms=[-.8,-.8];p.elbows=[-.3,-.3];p.prop='book';break;
  case 'argue':p.arms=[-.5,-1.0+.15*wave(t,4)];p.elbows=[-.4,-.8];p.armZ=[.2,-.4];p.headY=.15;break;
  case 'greet':case 'talk':p.arms=[-.2,-.7+.25*wave(t,3)];p.elbows[1]=-.7;p.armZ[1]=-.3;p.headY=.08*wave(t,1.2);break;
  case 'microscope':p.bodyX=.34;p.headX=.3;p.arms=[-.8,-.85];p.elbows=[-.45,-.5+.1*wave(t,3)];break;
  case 'experiment':p.arms=[-.8,-1.1];p.elbows=[-.6,-.7+.2*wave(t,2)];p.headX=.12;p.prop='vial';break;
  case 'clean':p.bodyX=.3;p.arms=[-.35,-.9];p.armZ[1]=wave(t,3)*.25;p.elbows[1]=-.4;p.prop='cloth';break;
  case 'paint':p.arms[1]=-1.2+.12*wave(t,3);p.elbows[1]=-.5;p.headX=.04;p.prop='pencil';break;
  case 'piano':work();p.elbows=[-.55+.12*wave(t,5),-.55-.12*wave(t,5)];p.armZ=[wave(t,2)*.12,-wave(t,2)*.12];break;
  case 'pingpong':p.bodyX=.15;p.arms=[-.35,-.8+.4*wave(t,3)];p.elbows[1]=-.7;p.armZ[1]=wave(t,3)*.5;p.prop='paddle';p.knees=[.15,.1];break;
  case 'stretch':p.arms=[-2.7,-2.7];p.armZ=[-.2,.2];p.bodyX=wave(t,1)*.1;p.headX=-.1;break;
  case 'toilet':p.arms=[-.25,-.25];p.headX=.08;break;
 }
 return p;
}
export function animateCharacter(c,clip,time,dt,{blend=1,from='idle',render={},gesture}={}){
 const p=samplePose(clip,time);
 if(gesture){const upper=samplePose(gesture,time);for(const key of ['arms','armZ','elbows','headX','headY'])p[key]=upper[key];}
 if(blend<1){const a=samplePose(from,time);for(const k of ['bodyY','bodyZ','bodyX','headX','headY','jump'])p[k]=a[k]+(p[k]-a[k])*blend;for(const k of ['arms','armZ','elbows','legs','knees'])p[k]=p[k].map((v,i)=>a[k][i]+(v-a[k][i])*blend);p.prop=null;}
 for(const [k,v] of Object.entries(render))if(['y','z'].includes(k))p[k==='y'?'bodyY':'bodyZ']=v*blend;
 c.body.position.set(0,p.bodyY+p.jump,p.bodyZ);c.body.rotation.x=p.bodyX;c.head.rotation.set(p.headX,p.headY,0);
 for(let i=0;i<2;i++){c.arms[i].rotation.set(p.arms[i],0,p.armZ[i]);c.elbows[i].rotation.x=p.elbows[i];c.legs[i].rotation.x=p.legs[i];c.knees[i].rotation.x=p.knees[i];}
 for(const [key,prop] of Object.entries(c.handProps))prop.visible=key===p.prop;
 const ball=c.handProps.ball;if(p.prop==='ball')ball.position.set(0,p.propY,p.propZ);
 c.clip=clip;
}
