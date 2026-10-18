import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';
const source = readFileSync('parenting-assistant.js', 'utf8');
function load() {
  class Element {
    constructor() { this.children=[]; this.events={}; this.attrs={}; this.hidden=false; this.value=''; this.classList={toggle:vi.fn()}; }
    setAttribute(name,value){this.attrs[name]=value;}
    append(...children){this.children.push(...children);}
    appendChild(child){this.append(child);return child;}
    replaceChildren(){this.children=[];}
    addEventListener(name,fn){this.events[name]=fn;}
    focus(){this.focused=true;}
    scrollIntoView(){this.scrolled=true;}
    get lastElementChild(){return this.children.at(-1);}
  }
  const input=new Element(),form=new Element(),log=new Element(),welcome=new Element(),send=new Element(),clear=new Element();
  const prompts=['수유 간격은 어떻게 잡으면 좋을까요?','밤에 자주 깨는데 무엇을 살펴볼까요?'].map(text=>Object.assign(new Element(),{textContent:text}));
  const controls={'textarea':input,'form':form,'[role="log"]':log,'.assistant-welcome':welcome,'[type="submit"]':send,'[data-assistant-clear]':clear};
  const views=[new Element(),new Element()];
  const tabs=['calendar','growth','assistant','travel'].map(view=>Object.assign(new Element(),{dataset:{view}}));
  const main=new Element(); main.appendChild=child=>{views.push(child);}; main.querySelectorAll=()=>views;
  const nav=new Element(); nav.querySelectorAll=()=>tabs;
  const add=new Element();
  const document={getElementById:id=>views.find(view=>view.id===id),querySelector:s=>({'main':main,'.view-tabs':nav,'#addEventButton':add}[s]),createElement:()=>{
    const element=new Element();element.querySelector=s=>controls[s];element.querySelectorAll=()=>prompts;return element;
  }};
  const events={},storage=new Map();
  const window={FAMILY_APP_STATE:{activeView:'calendar'},switchView:vi.fn(next=>{window.FAMILY_APP_STATE.activeView=next;}),addEventListener:(name,fn)=>{events[name]=fn;},confirm:vi.fn(()=>true)};
  window.switchView.existingMarker=true;
  vm.runInNewContext(source,{window,document,localStorage:{setItem:(k,v)=>storage.set(k,v)},ACTIVE_VIEW_KEY:'active'});
  const submit=value=>{input.value=value;form.events.submit({preventDefault(){}});};
  return {window,view:views.at(-1),views,input,log,welcome,send,clear,prompts,events,storage,submit,nav,tabs};
}

test('the chat is deferred and remains explicitly disconnected without sending data',()=>{
 const config=readFileSync('config.js','utf8');
 expect(config).toContain("assistant: ['parenting-assistant']");
 const app=load();
 expect(app.view.hidden).toBe(true);
 expect(app.view.innerHTML).toContain('AI 연결 전');
 expect(app.view.innerHTML).toContain('새로고침하면 사라져요.');
 expect(source).not.toMatch(/fetch\(|supabase|OPENAI_API_KEY|setItem\([^,]*,\s*(question|input|log)/);
 app.window.switchView('assistant');
 expect(app.view.hidden).toBe(false);
 expect(app.views.slice(0,-1).every(view=>view.hidden)).toBe(true);
 expect(app.window.FAMILY_APP_STATE.activeView).toBe('assistant');
 expect(app.storage.get('active')).toBe('assistant');
 expect(app.window.switchView.existingMarker).toBe(true);
});

test('questions remain text, cannot exceed the input limit, and never fabricate an AI reply',()=>{
 const app=load();
 app.submit('   ');app.submit('a'.repeat(2001));
 expect(app.log.children).toHaveLength(0);
 const question='<img src=x onerror=alert(1)>\n수유 질문';
 app.submit(question);
 expect(app.log.children).toHaveLength(2);
 expect(app.log.children[0].children[1].textContent).toBe(question);
 expect(app.log.children[0].children[1].innerHTML).toBeUndefined();
 expect(app.log.children[1].children[0].textContent).toBe('연결 안내');
 expect(app.log.children[1].children[1].textContent).toContain('외부로 전송하지 않고');
 expect(app.welcome.hidden).toBe(true);
 expect(app.input.value).toBe('');expect(app.send.disabled).toBe(true);
});

test('suggestions prepare editable questions, drafts survive navigation, and family changes clear private text',()=>{
 const app=load();
 app.prompts[0].events.click();
 expect(app.input.value).toBe(app.prompts[0].textContent);
 expect(app.input.focused).toBe(true);expect(app.send.disabled).toBe(false);
 expect(app.log.children).toHaveLength(0);
 app.window.switchView('assistant');app.window.switchView('calendar');app.window.switchView('assistant');
 expect(app.input.value).toBe(app.prompts[0].textContent);
 app.submit('질문');app.input.value='작성 중인 질문';
 app.events.familycontextchange();
 expect(app.log.children).toHaveLength(0);expect(app.input.value).toBe('');
 expect(app.welcome.hidden).toBe(false);expect(app.clear.hidden).toBe(true);
});

test('clearing questions can be cancelled and reopening the injected tab works',()=>{
 const app=load();app.submit('질문');
 app.window.confirm.mockReturnValueOnce(false);app.clear.events.click();
 expect(app.log.children).toHaveLength(2);
 app.clear.events.click();expect(app.log.children).toHaveLength(0);
 app.nav.events.click({target:{closest:()=>({dataset:{view:'assistant'}})}});
 expect(app.window.FAMILY_APP_STATE.activeView).toBe('assistant');
});
