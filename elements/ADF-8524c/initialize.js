function(instance, context) {

    // ===================================================================
    // SlimSearch v1.0 — initialize
    // SlimSelect 4.0.7 como UI + MiniSearch como motor de busca.
    // ===================================================================

    // Id único desta instância. Duas cópias do elemento na mesma página
    // não podem compartilhar o mesmo <select>.
    instance.data.uid = 'sq' + Math.random().toString(36).slice(2, 10);

    // O <select> que o SlimSelect vai transformar. Ele é criado aqui,
    // dentro do canvas do próprio elemento — é isto que nos livra de
    // depender de um input nativo do Bubble.
    var canvas = instance.canvas[0];

    // A caixa do SlimSelect é `width:100%` do canvas, e o container de
    // valores é `flex:1 1 0%; min-width:0`. Num canvas sem largura
    // definida o texto colapsa para zero e sobra só a seta.
    canvas.style.display    = 'flex';
    canvas.style.alignItems = 'stretch';
    canvas.style.width      = '100%';
    canvas.style.minWidth   = '0';
    // A caixa acompanha a altura do elemento definida no editor do
    // Bubble. Junto com box-sizing:border-box no .ss-main, isso faz o
    // padding caber POR DENTRO em vez de somar — sem isso a altura
    // visual vira `altura + padding*2` e estoura a borda de baixo.
    canvas.style.height   = '100%';
    // stretch: o .ss-main preenche a altura do canvas e centraliza o
    // texto por dentro (align-items:center é da própria lib). Assim o
    // alinhamento vertical não depende de quem carrega o padding — o
    // Bubble na div externa ou o plugin na caixa.
    // Escondido até o SlimSelect assumir. Sem isto, o <select> cru
    // aparece por um instante e parece que algo quebrou.
    canvas.style.visibility = 'hidden';
    // A classe é o que permite escondê-lo por CSS. Ela vai no CANVAS,
    // nunca no <select>: o SlimSelect copia o className e o cssText do
    // select para dentro das próprias settings, e aplica nos elementos
    // que ele cria — qualquer estilo posto ali vazaria para a caixa e
    // para o dropdown.
    canvas.classList.add('sq-canvas');


    // ================================================================
    // CSS próprio, injetado uma vez por página.
    //
    // Por que existe: no CSS da lib, `.ss-content` usa
    //   background-color: var(--ss-bg-color);
    //   border: solid 1px var(--ss-border-color);
    //   max-height: var(--ss-content-height);
    // Se qualquer uma dessas variáveis receber um valor inválido, o
    // navegador DESCARTA a declaração inteira (invalid at
    // computed-value time) — e o dropdown fica transparente, sem borda
    // e com altura infinita, as três coisas de uma vez.
    //
    // Aqui tudo usa var(--sq-*, fallback). Variável quebrada nunca
    // zera a regra: no pior caso cai no valor padrão.
    // ================================================================
    if (!document.getElementById('sq_estilos_globais')) {
        var st = document.createElement('style');
        st.id = 'sq_estilos_globais';
        st.textContent = [
            /* ---- o <select> cru nunca aparece ---- */
            // Antes do SlimSelect assumir, o navegador desenharia o
            // select nativo (uma caixinha com seta). A regra é ancorada
            // na classe do canvas, não em nada dentro do <select>.
            '.sq-canvas > select{',
            '  position:absolute!important;',
            '  width:1px!important;height:1px!important;',
            '  padding:0!important;margin:0!important;border:0!important;',
            '  opacity:0!important;overflow:hidden!important;',
            '  pointer-events:none!important;',
            '  clip-path:inset(50%)!important;',
            '}',

            /* ---- caixa do dropdown ---- */
            '.ss-content{',
            // Quando um popup do Bubble abre, ele aplica filter/backdrop-filter
            // no conteúdo de fundo para desfocá-lo. Um `filter` num ancestral
            // cria um novo containing block: qualquer descendente com
            // position:fixed passa a se posicionar por ele E herda o desfoque.
            // O dropdown é fixed e vive no document.body, então saía borrado.
            '  filter:none!important;',
            '  backdrop-filter:none!important;',
            '  background:var(--sq-bg,#fff)!important;',
            '  border:1px solid var(--sq-borda,#d5dbe0)!important;',
            '  border-radius:var(--sq-raio-lista,8px)!important;',
            '  box-shadow:0 6px 24px rgba(16,24,40,.12);',
            '  max-height:var(--sq-altura-lista,340px)!important;',
            '  padding:4px;',
            '  box-sizing:border-box;',
            '  overscroll-behavior:contain;',
            '}',
            /* cantos: a lib zera um dos lados conforme abre p/ cima ou baixo */
            '.ss-content.ss-dir-above,.ss-content.ss-dir-below{',
            '  border-radius:var(--sq-raio-lista,8px)!important;',
            '}',

            /* ---- barra de busca ---- */
            '.ss-content .ss-search{',
            '  padding:var(--sq-busca-pad,6px);',
            '  border-bottom:1px solid var(--sq-borda,#d5dbe0);',
            '  min-height:var(--sq-busca-altura,44px);',
            '  box-sizing:border-box;',
            '}',
            '.ss-content .ss-search input{',
            '  padding:var(--sq-busca-pad-v,8px) var(--sq-busca-pad-h,10px);',
            '  border-radius:var(--sq-op-raio,6px);',
            // A lib deixa a fonte do input herdar da página, o que faz
            // o texto da busca destoar do tamanho dos itens.
            '  font-size:var(--sq-tam-p,15px);',
            '  line-height:1.35;',
            '  height:auto;',
            '  box-sizing:border-box;',
            '  background:var(--sq-bg,#fff);',
            '  color:var(--sq-texto,#1f2933);',
            '}',
            '.ss-content .ss-search input::placeholder{',
            '  color:var(--sq-placeholder,#8b959e);',
            '}',

            /* ---- lista ---- */
            '.ss-content .ss-list{padding:4px 0 0;}',

            /* ---- item ---- */
            // A lib define .ss-option como flex em LINHA. Com isso os
            // nossos <div class="sq-linha"> viram itens do flex e ficam
            // lado a lado — "Linha nova" não desceria nunca.
            // column empilha e devolve o comportamento esperado.
            '.ss-content .ss-list .ss-option{',
            '  display:flex;',
            '  flex-direction:column;',
            '  align-items:stretch;',
            '  justify-content:center;',
            '  row-gap:var(--sq-gap-v,2px);',
            '  padding:var(--sq-op-pad-v,8px) var(--sq-op-pad-h,12px);',
            '  border-radius:var(--sq-op-raio,6px);',
            '  min-height:var(--sq-op-min,0);',
            '  height:auto;',
            '  color:var(--sq-texto,#1f2933);',
            '}',
            // Respiro entre itens. Fica no item seguinte para não
            // sobrar espaço morto no fim da lista.
            '.ss-content .ss-list .ss-option + .ss-option{',
            '  margin-top:var(--sq-op-gap,2px);',
            '}',
            // A lib usa border-left de 5px no hover, o que empurra o
            // texto para o lado. Aqui o realce é só o fundo.
            '.ss-content .ss-list .ss-option:hover:not(.ss-disabled),',
            '.ss-content .ss-list .ss-option.ss-highlighted,',
            '.ss-content .ss-list .ss-option:not(.ss-disabled).ss-selected{',
            '  background:var(--sq-hover,#eef4f6)!important;',
            '  color:var(--sq-texto,#1f2933)!important;',
            '  border-left:none!important;',
            '}',

            /* ---- mensagens (carregando / vazio / erro) ---- */
            '.ss-content .ss-list .ss-searching,',
            '.ss-content .ss-list .ss-error,',
            '.ss-content .ss-list .ss-search{',
            '  padding:10px 12px;',
            '  color:#8b959e;',
            '  font-style:italic;',
            '  border:none;',
            '}',

            /* ---- linhas dentro do item ---- */
            '.ss-content .sq-linha{',
            '  display:flex;',
            '  align-items:var(--sq-alinha,baseline);',
            '  flex-wrap:var(--sq-quebra,nowrap);',
            '  min-width:0;',
            '}',
            // Espaço entre os pedaços da linha. Vai por margem, não por
            // gap: margem entre irmãos é mais previsível dentro de um
            // container cujo conteúdo é reescrito pelo destaque da busca.
            '.ss-content .sq-linha > * + *{',
            '  margin-left:var(--sq-gap-h,8px);',
            '}',
            // O rótulo é o dado principal da linha: não encolhe.
            // Sem isto todos os spans encolhem juntos e o nome vira
            // "9 de a…" mesmo sobrando espaço para os secundários.
            '.ss-content .sq-p{',
            '  flex:0 0 auto;',
            '  min-width:0;',
            '  max-width:var(--sq-max-p,100%);',
            '  font-size:var(--sq-tam-p,15px);',
            '  font-weight:var(--sq-peso-p,500);',
            '  line-height:1.35;',
            '  white-space:var(--sq-nowrap,nowrap);',
            '  overflow:hidden;text-overflow:ellipsis;',
            '}',
            // Os secundários cedem primeiro.
            '.ss-content .sq-s{',
            '  flex:0 1 auto;',
            '  min-width:0;',
            '  font-size:var(--sq-tam-s,13px);',
            '  font-weight:var(--sq-peso-s,400);',
            '  line-height:1.35;color:var(--sq-texto-2,#7b8794);',
            '  white-space:var(--sq-nowrap,nowrap);',
            '  overflow:hidden;text-overflow:ellipsis;',
            '}',

            /* ---- destaque do termo buscado ---- */
            // A lib deixa este <mark> como inline-block. Dentro de uma
            // linha com align-items:baseline, um inline-block desloca a
            // linha de base e a opção cresce — por isso os itens ficavam
            // mais altos SÓ depois de digitar. Aqui ele volta a ser um
            // trecho de texto comum, sem efeito no layout.
            '.ss-content .ss-list .ss-option .ss-search-highlight,',
            '.ss-content .ss-list .ss-option mark{',
            '  display:inline!important;',
            '  vertical-align:baseline!important;',
            '  line-height:inherit!important;',
            '  font-size:inherit!important;',
            '  padding:0!important;margin:0!important;',
            '  background:transparent!important;',
            '  color:var(--sq-destaque,#0d7b8a);',
            '  font-weight:700;',
            '}',

            /* ---- caixa fechada ---- */
            '.ss-main{',
            '  background:var(--sq-bg,#fff);',
            '  color:var(--sq-texto,#1f2933);',
            // border-box: padding e borda cabem DENTRO da altura, não
            // somam. É o que faz "altura do elemento no Bubble" ser a
            // altura visual, sem cálculo manual.
            '  box-sizing:border-box;',
            '  height:var(--sq-caixa-altura,100%);',
            // O fallback aponta para --ss-main-height (campo "altura"),
            // senão esse campo deixa de ter efeito. No modo
            // usar_estilo_do_bubble isto vira 0: o padding do Bubble
            // encolhe a área interna e um mínimo faria a caixa
            // transbordar para baixo.
            '  min-height:var(--sq-caixa-min,var(--ss-main-height,40px));',
            '}',
            '.ss-main .ss-values .ss-single,',
            '.ss-main .ss-values .ss-placeholder,',
            '.ss-main .ss-values .ss-multi-string{',
            '  font-size:var(--sq-tam-p,15px);',
            '}',
            '.ss-main .ss-values .ss-placeholder{',
            '  color:var(--sq-placeholder,#8b959e);',
            '}',
            // Seta nativa: sem isto ela fica na cor de texto da lib,
            // mais escura que o resto da UI.
            '.ss-main .ss-arrow path{stroke:var(--sq-seta,#7b8794);}',
            // Ela reaproveita o mesmo html da opção; aqui fica só a
            // linha principal, senão vira um bloco de três linhas.
            '.ss-main .sq-s{display:none;}',
            '.ss-main .sq-linha + .sq-linha{display:none;}',
            '.ss-main .sq-p{font-weight:inherit;font-size:inherit;}',
            '.ss-main .ss-values{padding:var(--sq-padding-v,6px) 0;}',

            /* ---- ícone customizado ---- */
            '.ss-main .sq-icone{',
            '  flex:0 1 auto;display:flex;align-items:center;',
            '  justify-content:center;margin:auto 10px auto 6px;',
            '  line-height:1;',
            '  transition:transform var(--ss-animation-timing,.2s) ease;',
            '}',
            '.ss-main .sq-icone.sq-aberto{transform:rotate(180deg);}',
            '.ss-main .sq-limpar{',
            '  display:flex;align-items:center;justify-content:center;',
            '  line-height:1;cursor:pointer;',
            '  color:var(--sq-limpar-cor,#8b959e);',
            '}',
            '.ss-main .ss-deselect{cursor:pointer;}'
        ].join('\n');
        document.head.appendChild(st);
    }


    var sel = document.createElement('select');
    sel.id = 'sel_' + instance.data.uid;
    canvas.appendChild(sel);

    instance.data.selectEl = sel;

    // ---- o slimselect.css carregou? ----
    // Sem ele não há borda, padding nem seta: o elemento vira só um
    // texto solto na página. Como isso é fácil de confundir com "o
    // plugin não funciona", conferimos e avisamos.
    (function () {
        try {
            var teste = document.createElement('div');
            teste.className = 'ss-hide';
            teste.style.position = 'absolute';
            document.body.appendChild(teste);
            var ok = getComputedStyle(teste).display === 'none';
            document.body.removeChild(teste);
            instance.data.cssOk = ok;
            if (!ok) {
                console.error('[SlimSearch] O slimselect.css NÃO carregou. ' +
                    'Sem ele o elemento aparece sem borda, sem padding e sem ' +
                    'seta. Confira se a tag <link> do slimselect.css está em ' +
                    'Plugin editor > Settings > "Headers to add to your page" ' +
                    'e se a página foi recarregada depois de salvar.');
            }
        } catch (err) {
            instance.data.cssOk = true;   // na dúvida, não atrapalha
        }
    })();

    // --- estado ---
    instance.data.slim        = null;   // instância do SlimSelect
    instance.data.mini        = null;   // índice MiniSearch
    instance.data.porId       = null;   // Map: id do registro -> item completo
    instance.data.opcoes      = [];     // opções no formato do SlimSelect
    instance.data.assinatura  = null;   // detecta mudança real nos dados
    instance.data.carregou    = false;
    instance.data.liberado    = false;
    instance.data.min         = 0;
    instance.data.idInicial   = null;
    instance.data.temSelecao  = false;
    instance.data.silencioso  = false;  // suprime eventos durante set programático
    instance.data.pendente    = null;   // busca esperando os dados chegarem
    instance.data.ultimoVazio = null;

    // Escapa antes de qualquer coisa ir para innerHTML.    // O `html` da Option do SlimSelect É innerHTML — e os valores vêm
    // do banco do usuário. Sem isto, um registro chamado <img onerror=...>
    // executa script.
    instance.data.esc = function (s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    instance.data.semAcento = function (s) {
        return String(s == null ? '' : s)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    };

    // Listas do Bubble não são arrays. Isto normaliza.
    instance.data.paraArray = function (campo) {
        if (!campo) return [];
        if (typeof campo.length === 'function' && typeof campo.get === 'function') {
            var n = campo.length();
            if (!n) return [];
            return campo.get(0, n) || [];
        }
        if (Array.isArray(campo)) return campo;
        return [];
    };
}