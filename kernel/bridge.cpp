#include <emscripten/bind.h>
#include <sml_Client.h>
#include <vector>
#include <string>
#include <memory>
#include <fstream>
#include <cstdio>
#include <set>
#include <cmath>
using emscripten::val;
struct Mind { sml::Agent* agent; sml::Identifier* frame=nullptr; std::vector<std::string> fired; std::vector<std::string> files; };
static sml::Kernel* kernel=nullptr;
static std::vector<std::unique_ptr<Mind>> minds;
static void firing(sml::smlProductionEventId,void* data,sml::Agent*,const char* name,const char*) {
 auto* m=static_cast<Mind*>(data); if(m->fired.size()<300)m->fired.emplace_back(name);
}
static std::string cli(sml::Agent* a,const std::string& text){std::string r=a->ExecuteCommandLine(text.c_str());if(!a->GetLastCommandLineResult()){fprintf(stderr,"Soar CLI error: %s: %s\n",text.c_str(),r.c_str());throw std::runtime_error(text+": "+r);}return r;}
static int create(std::string name){
 if(!kernel){kernel=sml::Kernel::CreateKernelInCurrentThread(true,0);kernel->SetAutoCommit(false);}
 auto m=std::make_unique<Mind>();m->agent=kernel->CreateAgent(name.c_str());
 // Explore among indifferent candidates; explicit better/worse and reject preferences still apply.
 for(auto c:{"trace 0","soar max-elaborations 80","soar max-goal-depth 12","chunk only","smem --enable","epmem --enable","epmem --set trigger none","smem --set cache-size 128","epmem --set cache-size 128","rl --set learning on","rl --set temporal-extension off","rl --set eligibility-trace-decay-rate 0.7","decide indifferent-selection --epsilon-greedy","decide indifferent-selection --epsilon 0.1"})cli(m->agent,c);
 m->agent->RegisterForProductionEvent(sml::smlEVENT_AFTER_PRODUCTION_FIRED,firing,m.get());
 minds.push_back(std::move(m));return minds.size()-1;
}
static val command(int id,std::string src){auto* a=minds.at(id)->agent;std::string msg=a->ExecuteCommandLine(src.c_str());val v=val::object();v.set("ok",a->GetLastCommandLineResult());v.set("message",msg);return v;}
static void fields(sml::Agent*,sml::Identifier*,val,int);
static void field(sml::Agent* a,sml::Identifier* parent,const std::string& k,val v,int depth){
 if(v.isNull()||v.isUndefined())return;
 std::string type=v.typeOf().as<std::string>();
 if(type=="number"){double n=v.as<double>();if(!std::isfinite(n))throw std::runtime_error("Nonfinite input");if(std::floor(n)==n)a->CreateIntWME(parent,k.c_str(),(long long)n);else a->CreateFloatWME(parent,k.c_str(),n);}
 else if(type=="boolean")a->CreateStringWME(parent,k.c_str(),v.as<bool>()?"yes":"no");
 else if(type=="string")a->CreateStringWME(parent,k.c_str(),v.as<std::string>().c_str());
 else if(type=="object"){
  if(val::global("Array").call<bool>("isArray",v)){for(int i=0;i<v["length"].as<int>();i++)field(a,parent,k,v[i],depth+1);}
  else{auto* child=a->CreateIdWME(parent,k.c_str());fields(a,child,v,depth+1);}
 }
}
static void fields(sml::Agent* a,sml::Identifier* parent,val obj,int depth=0){
 if(depth>16)throw std::runtime_error("Input graph too deep");
 val keys=val::global("Object").call<val>("keys",obj);
 for(int i=0;i<keys["length"].as<int>();i++){auto k=keys[i].as<std::string>();field(a,parent,k,obj[k],depth);}
}
static val unpack(sml::Identifier* id,int depth=0){
 val out=val::object();if(depth>12)return out;
 for(int i=0;i<id->GetNumberChildren();i++){
  auto* w=id->GetChild(i);std::string k=w->GetAttribute();val v=val::undefined();
  if(w->IsIdentifier())v=unpack(w->ConvertToIdentifier(),depth+1);
  else if(w->ConvertToIntElement())v=val((double)w->ConvertToIntElement()->GetValue());
  else if(w->ConvertToFloatElement())v=val(w->ConvertToFloatElement()->GetValue());
  else v=val(std::string(w->GetValueAsString()));
  if(out.hasOwnProperty(k.c_str())){val old=out[k];if(!val::global("Array").call<bool>("isArray",old)){val list=val::array();list.call<void>("push",old);out.set(k,list);}out[k].call<void>("push",v);}else out.set(k,v);
 }
 return out;
}
static val step(int id,val facts,val candidates,int seq){
 auto& m=*minds.at(id);auto* a=m.agent;m.fired.clear();const int initialCycles=a->GetDecisionCycleCounter();
 const std::string mode=facts["mode"].as<std::string>();cli(a,mode=="feedback"?"rl --set learning on":"rl --set learning off");
 if(m.frame)a->DestroyWME(m.frame);
 m.frame=a->CreateIdWME(a->GetInputLink(),"frame");fields(a,m.frame,facts);a->CreateIntWME(m.frame,"seq",seq);
 for(int i=0;i<candidates["length"].as<int>();i++){auto* c=a->CreateIdWME(m.frame,"available");fields(a,c,candidates[i]);}
 a->Commit();val result=val::object();bool found=false;int phases=0;
 // Run complete phases. A transaction ends at input, after memory/reward processing.
 for(;phases<240&&!found;phases++){
  a->RunSelf(1,sml::sml_PHASE);
  auto* out=a->GetOutputLink();
  for(int i=0;i<out->GetNumberChildren();i++){
   auto* w=out->GetChild(i);if(!w->IsIdentifier()||std::string(w->GetAttribute())!="command")continue;
   auto* c=w->ConvertToIdentifier();const char* s=c->GetParameterValue("seq");if(!s||std::stoi(s)!=seq)continue;
   result=unpack(c);found=true;break;
  }
 }
 if(found){
  if(result.hasOwnProperty("remember")&&result["remember"].as<std::string>()=="yes"){cli(a,"epmem --set force remember"); if(a->GetCurrentPhase()==sml::sml_INPUT_PHASE)a->RunSelf(1,sml::sml_PHASE);}
  for(int n=0;a->GetCurrentPhase()!=sml::sml_INPUT_PHASE&&n<8;n++)a->RunSelf(1,sml::sml_PHASE);
 }
 val trace=val::array();for(const auto& x:m.fired)trace.call<void>("push",x);result.set("fired",trace);result.set("ok",found);result.set("phases",phases);result.set("cycles",a->GetDecisionCycleCounter()-initialCycles);return result;
}
static val bytes(const std::string& path){std::ifstream f(path,std::ios::binary);std::vector<unsigned char> b((std::istreambuf_iterator<char>(f)),{});if(b.empty())throw std::runtime_error("Empty memory checkpoint");return val::global("Uint8Array").new_(val(emscripten::typed_memory_view(b.size(),b.data())));}
static void writebytes(const std::string& path,val data){int size=data["length"].as<int>();std::vector<unsigned char>b(size);val(emscripten::typed_memory_view(b.size(),b.data())).call<void>("set",data);std::ofstream f(path,std::ios::binary);f.write((char*)b.data(),b.size());}
static val snapshot(int id){auto& m=*minds.at(id);val result=val::object();for(const char* kind:{"smem","epmem"}){std::string file="/checkpoint-"+std::to_string(id)+"-"+kind+".db";std::remove(file.c_str());cli(m.agent,std::string(kind)+" --backup "+file);result.set(kind,bytes(file));std::remove(file.c_str());}result.set("productions",cli(m.agent,"print --all --full"));return result;}
static void restore(int id,val data){auto& m=*minds.at(id);for(const char* kind:{"smem","epmem"}){std::string file="/restored-"+std::to_string(id)+"-"+kind+".db";writebytes(file,data[kind]);m.files.push_back(file);cli(m.agent,std::string(kind)+" --set database file");cli(m.agent,std::string(kind)+" --set path "+file);cli(m.agent,std::string(kind)+" --set append on");cli(m.agent,std::string(kind)+" --init");}}
static void destroy(int id){if(id<0||id>=minds.size()||!minds[id])return;auto files=minds[id]->files;kernel->DestroyAgent(minds[id]->agent);minds[id].reset();for(auto& f:files)std::remove(f.c_str());}
EMSCRIPTEN_BINDINGS(family_soar){emscripten::function("createAgent",&create);emscripten::function("command",&command);emscripten::function("step",&step);emscripten::function("snapshot",&snapshot);emscripten::function("restore",&restore);emscripten::function("destroyAgent",&destroy);}
