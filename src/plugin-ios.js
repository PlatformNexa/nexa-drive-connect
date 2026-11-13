/* NEXA Drive Connect — iPhone direct OAuth/Google Drive adapter, controlled synchronization. */
const { Plugin, PluginSettingTab, Setting, Modal, Notice, requestUrl } = require('obsidian');
const NEXA_SECRET_KEY = 'nexa-drive-connect-google-oauth-v1';
const DEFAULT_SETTINGS={clientId:'',remoteRootId:'',autoSync:false,intervalMinutes:10,
  lastStatus:'Ainda não sincronizado',remoteRootName:'',baseline:{}};
function errorMessage(e){return String(e && e.message || e).replace(/[\r\n]/g,' ').slice(0,220);}
class NexaPlanModal extends Modal {
  constructor(app, snapshot, execute) {super(app);this.snapshot=snapshot;this.execute=execute;}
  onOpen(){
    const el=this.contentEl;el.empty();const p=this.snapshot.plan;
    el.createEl('h2',{text:'NEXA — Prévia de sincronização'});
    el.createEl('p',{text:`Pasta remota: ${this.snapshot.remote.rootName} · Enviar/baixar: ${p.actions.length} · Conflitos/bloqueios: ${p.blocked.length} · Iguais: ${p.unchanged.length}`});
    el.createEl('p',{text:'Nenhuma exclusão é propagada. O primeiro espelhamento divergente é bloqueado. Backups locais são criados antes de substituições.'});
    const list=el.createEl('div');list.style.maxHeight='40vh';list.style.overflowY='auto';
    for(const a of p.actions.slice(0,75))list.createEl('p',{text:`${a.type}: ${a.path}`});
    for(const b of p.blocked.slice(0,75))list.createEl('p',{text:`BLOQUEADO: ${b.path||'(sem caminho)'} — ${b.reason}`});
    if(p.actions.length+p.blocked.length>150)list.createEl('p',{text:'Prévia resumida. Operações excedentes não são ocultadas na contagem.'});
    new Setting(el).addButton(b=>b.setButtonText('Fechar').onClick(()=>this.close()));
    if(!p.blocked.length && (p.actions.length || p.unchanged.length)){
      new Setting(el).setName(p.actions.length ? 'Aplicar alterações revisadas' : 'Registrar baseline confirmado').setDesc('Executa preflight novamente e valida cada escrita.').addButton(b=>b.setButtonText(p.actions.length ? 'Confirmar sincronização' : 'Confirmar estado inicial').setCta().onClick(async()=>{this.close();await this.execute();}));
    }
    if(p.blocked.length)el.createEl('p',{text:'Conflitos ou arquivos não processáveis: nenhuma escrita será executada neste lote. Resolva antes de sincronizar.'});
  }
}
class NexaSettingsTab extends PluginSettingTab{
  constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
  display(){
    const p=this.plugin,e=this.containerEl;e.empty();
    e.createEl('h2',{text:'NEXA Drive Connect — iPhone'});
    e.createEl('p',{text:'Google Drive ↔ cofre local. Sem Windows ou servidor de arquivos. Uma página estática do próprio projeto devolve o código de login (OAuth PKCE).'});
    e.createEl('p',{text:'Atenção: permissão OAuth do Google abrange o Drive da conta. O NEXA limita suas operações à pasta verificada. Nunca use uma conta com documentos confidenciais sem revisar essa permissão.'});
    new Setting(e).setName('Client ID Google').setDesc('ID do cliente OAuth tipo Aplicação web criado no seu Google Cloud.').addText(t=>t.setPlaceholder('...apps.googleusercontent.com').setValue(p.settings.clientId).onChange(async v=>{p.settings.clientId=v.trim();await p.saveSettings();}));
    new Setting(e).setName('Client Secret Google').setDesc('Armazenado em SecretStorage do Obsidian; não aparece no vault nem no GitHub.').addText(t=>{t.inputEl.type='password';t.setPlaceholder('Cole e toque em Salvar');}).addButton(b=>b.setButtonText('Salvar').onClick(async()=>{
      const input=e.querySelector('input[placeholder="Cole e toque em Salvar"]');
      if(!input || !input.value){new Notice('Informe o client secret.');return;}
      await p.updateSecret({clientSecret:input.value});input.value='';new Notice('Client Secret salvo no armazenamento de segredos.');
    }));
    new Setting(e).setName('Login Google').setDesc('Abre o navegador no iPhone. Use o mesmo cliente que configurou no Google Cloud.').addButton(b=>b.setButtonText('Autorizar Google').onClick(()=>p.authorize()));
    e.createEl('p',{text:'URI de retorno obrigatório no Google Cloud: '+NEXA_AUTH.CALLBACK});
    new Setting(e).setName('ID da pasta Obsidian').setDesc('Cole o ID da pasta Google Drive existente ou o URL completo dela. Não cria outra pasta.').addText(t=>t.setPlaceholder('ID ou link da pasta Obsidian').setValue(p.settings.remoteRootId).onChange(async v=>{
      p.settings.remoteRootId=p.extractId(v);await p.saveSettings();
    }));
    new Setting(e).setName('Prévia e sincronização').setDesc('Compara local e remoto. Só grava após confirmação, com backups e readback.').addButton(b=>b.setButtonText('Analisar alterações').setCta().onClick(()=>p.syncPreview()));
    new Setting(e).setName('Sincronização automática').setDesc('Habilitar somente depois da primeira sincronização conferida. Executa enquanto o Obsidian estiver ativo; pausa diante de conflitos.').addToggle(t=>t.setValue(p.settings.autoSync).onChange(async v=>{p.settings.autoSync=v;await p.saveSettings();}));
    new Setting(e).setName('Intervalo automático (minutos)').addDropdown(d=>{
      for(const n of [5,10,15,30])d.addOption(String(n),String(n));
      d.setValue(String(p.settings.intervalMinutes)).onChange(async v=>{p.settings.intervalMinutes=Number(v);await p.saveSettings();});
    });
    new Setting(e).setName('Desconectar Google').setDesc('Apaga os tokens locais salvos neste dispositivo; não altera o Drive.').addButton(b=>b.setWarning().setButtonText('Desconectar').onClick(async()=>{await p.dropCredentials();new Notice('Autorização local desconectada.');}));
    e.createEl('h3',{text:'Estado'});e.createEl('p',{text:p.settings.lastStatus});
    e.createEl('p',{text:'Excluídos da sincronização: .obsidian, .git, .nexa-connect-recovery, .trash. Arquivos individuais acima de 20 MiB são bloqueados. Google Docs nativos não são convertidos nem sobrescritos.'});
  }
}
module.exports=class NexaDriveConnect extends Plugin{
  async onload(){
    this.settings=Object.assign({},DEFAULT_SETTINGS,await this.loadData()||{});this.busy=false;this.oauthPending=null;this.nextTick=0;
    this.addSettingTab(new NexaSettingsTab(this.app,this));
    this.addCommand({id:'preview-sync',name:'Prévia da sincronização com Google Drive',callback:()=>this.syncPreview()});
    this.addCommand({id:'local-audit',name:'Auditar arquivos do cofre local',callback:()=>this.auditLocal()});
    this.registerObsidianProtocolHandler('nexa-drive-connect',(params)=>this.handleOAuth(params));
    this.registerInterval(window.setInterval(()=>this.maybeAutoSync(),60000));
  }
  async saveSettings(){await this.saveData(this.settings);}
  extractId(s){
    s=String(s||'').trim();const match=s.match(/\/folders\/([A-Za-z0-9_-]{8,})/);
    return match?match[1]:s;
  }
  readCredentials(){
    const raw=this.app.secretStorage?.getSecret(NEXA_SECRET_KEY);
    if(!raw)return {};try{return JSON.parse(raw);}catch{return {};}
  }
  async updateSecret(delta){
    if(!this.app.secretStorage?.setSecret)throw new Error('SecretStorage indisponível. Atualize o Obsidian.');
    this.app.secretStorage.setSecret(NEXA_SECRET_KEY,JSON.stringify({...this.readCredentials(),...delta}));
  }
  async dropCredentials(){
    if(this.app.secretStorage?.setSecret)this.app.secretStorage.setSecret(NEXA_SECRET_KEY,'');
    this.oauthPending=null;
  }
  async authorize(){
    try{
      if(!this.readCredentials().clientSecret)throw new Error('Primeiro informe o Client Secret nas configurações.');
      this.oauthPending=await NEXA_AUTH.start(this.settings.clientId);
      await this.updateSecret({pendingOAuth:this.oauthPending});
      window.open(this.oauthPending.url,'_blank');
      new Notice('Google: conclua o login no navegador.');
    }catch(e){new Notice('NEXA: '+errorMessage(e),9000);}
  }
  async handleOAuth(params){
    try{
      const pending=this.oauthPending || this.readCredentials().pendingOAuth;
      if(params.error)throw new Error('Autorização negada pelo Google.');
      if(!pending || Date.now()>pending.expires || !params.code || params.state!==pending.state)throw new Error('Retorno OAuth expirado ou não corresponde à autorização iniciada.');
      this.oauthPending=null;
      const old=this.readCredentials();
      const received=await NEXA_AUTH.exchange(requestUrl,this.settings.clientId,old.clientSecret,params.code,pending.verifier);
      await this.updateSecret({pendingOAuth:null,accessToken:received.access_token,refreshToken:received.refresh_token||old.refreshToken,
        expiresAt:Date.now()+Number(received.expires_in)*1000});
      new Notice('NEXA: Google autorizado. Agora execute a prévia.');
    }catch(e){this.oauthPending=null;await this.updateSecret({pendingOAuth:null}).catch(()=>{});new Notice('NEXA OAuth: '+errorMessage(e),10000);}
  }
  async accessToken(){
    const c=this.readCredentials();
    if(c.accessToken && Date.now()<c.expiresAt-90000)return c.accessToken;
    if(!c.refreshToken || !c.clientSecret || !this.settings.clientId)throw new Error('Faça login no Google nas configurações.');
    const t=await NEXA_AUTH.refresh(requestUrl,this.settings.clientId,c.clientSecret,c.refreshToken);
    await this.updateSecret({accessToken:t.access_token,expiresAt:Date.now()+Number(t.expires_in)*1000});
    return t.access_token;
  }
  engine(){return new NEXA_SYNC.SyncEngine(this.app.vault,
    new NEXA_DRIVE.DriveClient(requestUrl,()=>this.accessToken()),
    async()=>this.settings,
    async d=>{this.settings={...this.settings,...d};await this.saveSettings();});}
  async snapshot(){
    if(!/^[\w-]{8,}$/.test(this.settings.remoteRootId))throw new Error('Configure o ID da pasta Obsidian existente.');
    const preview=await this.engine().preview(this.settings.remoteRootId);
    if(preview.remote.rootName!=='Obsidian')throw new Error('A pasta remota precisa chamar-se exatamente Obsidian.');
    return preview;
  }
  async syncPreview(){
    if(this.busy){new Notice('NEXA: outra operação em andamento.');return;}
    this.busy=true;
    try{
      const snap=await this.snapshot();
      new NexaPlanModal(this.app,snap,()=>this.applySnapshot(snap)).open();
    }catch(e){new Notice('NEXA: '+errorMessage(e),12000);}
    finally{this.busy=false;}
  }
  async applySnapshot(snap){
    if(this.busy){new Notice('NEXA: outra operação ativa.');return;}
    if(snap.plan.blocked.length){new Notice('NEXA: há bloqueios; escrita não iniciada.');return;}
    this.busy=true;
    try{
      const report=await this.engine().apply(snap,true);
      this.settings.lastStatus=report.status+': '+report.success.length+' alterações; '+report.failed.length+' falhas';
      await this.saveSettings();new Notice('NEXA: '+this.settings.lastStatus,12000);
    }catch(e){this.settings.lastStatus='FALHOU: '+errorMessage(e);await this.saveSettings();new Notice('NEXA: '+this.settings.lastStatus,12000);}
    finally{this.busy=false;}
  }
  async maybeAutoSync(){
    if(!this.settings.autoSync || !this.settings.remoteRootId || this.busy || Date.now()<this.nextTick)return;
    this.nextTick=Date.now()+this.settings.intervalMinutes*60000;
    this.busy=true;
    try{
      const snap=await this.snapshot();
      if(snap.plan.blocked.length){this.settings.lastStatus='PAUSADO: '+snap.plan.blocked.length+' conflitos/bloqueios';await this.saveSettings();return;}
      if(snap.plan.actions.length){
        const r=await this.engine().apply(snap,true);
        this.settings.lastStatus=r.status+': '+r.success.length+' operações; '+r.failed.length+' falhas';
        await this.saveSettings();
        if(r.failed.length)new Notice('NEXA: sincronização pausada por falha.');
      }
    }catch(e){this.settings.lastStatus='AUTO PAUSADO: '+errorMessage(e);await this.saveSettings();}
    finally{this.busy=false;}
  }
  async auditLocal(){
    try{const r=await NEXA_AUDIT.inventory(this.app.vault);
      new Notice('NEXA: '+r.files.length+' arquivos válidos, '+r.collisions.length+' colisões, '+r.skipped.length+' ignorados.',10000);
    }catch(e){new Notice('NEXA auditoria: '+errorMessage(e));}
  }
};