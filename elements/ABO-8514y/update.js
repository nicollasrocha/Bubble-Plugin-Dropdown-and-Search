function(instance, properties, context) {

    // ===================== CONFIGURAÇÃO =====================
    var MAX_VISIVEL = 50;    // resultados exibidos por vez
    var ALTURA_MAX  = 340;   // altura máxima do dropdown, em px
    var DIST_INPUT  = 4;     // espaço entre o input e o dropdown
    var FUZZY       = 0.2;   // tolerância a erro de digitação. 0 desliga.

    var MIN = parseInt(properties.min_caracteres, 10);
    if (isNaN(MIN) || MIN < 0) MIN = 0;
    instance.data.min = MIN;

    // Com MIN 0 o carregamento acontece junto com a página, e o field
    // "gatilho" não é necessário.
    if (MIN <= 0) instance.data.liberado = true;
    if (instance.data.liberado   === undefined) instance.data.liberado   = false;
    if (instance.data.carregou   === undefined) instance.data.carregou   = false;
    if (instance.data.temSelecao === undefined) instance.data.temSelecao = false;
    if (instance.data.idInicial  === undefined) instance.data.idInicial  = null;
    if (instance.data.silencioso === undefined) instance.data.silencioso = false;

    function semAcento(s) {
        return String(s)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function paraArray(campo) {
        if (!campo) return [];
        if (typeof campo.length === 'function' && typeof campo.get === 'function') {
            var n = campo.length();
            if (!n) return [];
            return campo.get(0, n) || [];
        }
        if (Array.isArray(campo)) return campo;
        return [];
    }

    // ============ 1. ESTILO POR INSTÂNCIA ============
    if (instance.data.box) {
        var estiloBox = instance.data.box.style;

        function px(valor, padrao) {
            var n = parseFloat(valor);
            return (isNaN(n) || n <= 0) ? padrao : n + 'px';
        }

        estiloBox.setProperty('--ac-fonte',  properties.fonte || 'Ubuntu');
        estiloBox.setProperty('--ac-tam-p',  px(properties.tamanho_principal,  '15px'));
        estiloBox.setProperty('--ac-tam-s',  px(properties.tamanho_secundario, '13px'));
        estiloBox.setProperty('--ac-peso-p', properties.peso_principal  || '500');
        estiloBox.setProperty('--ac-peso-s', properties.peso_secundario || '400');
    }

    // ============ 2. SELEÇÃO INICIAL — leitura ============
    var iniObj = properties.item_inicial || null;
    var iniId  = null;
    var iniTxt = null;

    if (iniObj && typeof iniObj.get === 'function' && properties.rotulo) {
        iniId  = iniObj.get('_id');
        iniTxt = iniObj.get(properties.rotulo);
    }

    // ============ 3. CARREGAR — SÓ DEPOIS DE LIBERADO ============
    var valores  = [];
    var carregou = false;

    if (instance.data.liberado) {

        var registros  = paraArray(properties.origem);
        var modoObjeto = false;

        if (registros.length > 0 && properties.rotulo) {
            modoObjeto = true;

            // Rótulo e id: campos nativos do registro, já vieram no pacote.
            var rotulos = [];
            var ids     = [];
            for (var r = 0; r < registros.length; r++) {
                rotulos.push(registros[r].get(properties.rotulo));
                ids.push(registros[r].get('_id'));
            }

            var slots = [
                { lista: paraArray(properties.linha_2),
                  prefixo: properties.prefixo_2 || '',
                  nova: properties.pos_2 !== 'Mesma linha' },
                { lista: paraArray(properties.linha_3),
                  prefixo: properties.prefixo_3 || '',
                  nova: properties.pos_3 !== 'Mesma linha' },
                { lista: paraArray(properties.linha_4),
                  prefixo: properties.prefixo_4 || '',
                  nova: properties.pos_4 !== 'Mesma linha' }
            ];

            // ---------- VERIFICAÇÃO DE ALINHAMENTO ----------
            // As listas dos slots casam com origem por POSIÇÃO. Sem prova de
            // que a ordem é a mesma, um registro mostraria o dado de outro.
            var temSlot = false;
            for (var ts = 0; ts < slots.length; ts++) {
                if (slots[ts].lista.length > 0) temSlot = true;
            }

            var chaves = paraArray(properties.verificar);
            var alinhado = false;

            if (!temSlot) {
                // Nenhuma linha configurada: não há o que verificar.
                alinhado = true;
            } else if (chaves.length === 0) {
                console.warn('[autocomplete] O campo "verificar" está vazio. ' +
                    'Preencha com a MESMA busca de origem, terminando em ' +
                    ":each item's unique id. Sem ele não é possível garantir " +
                    'que as informações extras pertencem ao registro certo — ' +
                    'os slots foram desativados.');
            } else if (chaves.length !== registros.length) {
                console.warn('[autocomplete] "verificar" tem ' + chaves.length +
                    ' itens e origem tem ' + registros.length + '. As duas ' +
                    'expressões precisam ser a MESMA busca, com os MESMOS ' +
                    'filtros e a MESMA ordenação. Slots desativados.');
            } else {
                alinhado = true;
                for (var c = 0; c < chaves.length; c++) {
                    if (String(chaves[c]) !== String(ids[c])) {
                        alinhado = false;
                        console.warn('[autocomplete] Desalinhamento na posição ' +
                            c + ': origem tem o registro ' + ids[c] +
                            ' e as listas extras têm ' + chaves[c] +
                            '. Slots desativados — dado errado é pior que ' +
                            'dado ausente.');
                        break;
                    }
                }
            }

            if (!alinhado) {
                for (var z = 0; z < slots.length; z++) slots[z].lista = [];
            }

            // Sem deduplicação: registros homônimos são coisas distintas.
            for (var k = 0; k < registros.length; k++) {
                var rot = rotulos[k];
                if (rot === null || rot === undefined) continue;
                rot = String(rot).trim();
                if (rot === '') continue;

                var partes = [];
                for (var e = 0; e < slots.length; e++) {
                    var val = slots[e].lista[k];
                    if (val === null || val === undefined) continue;
                    val = String(val).trim();
                    if (val === '') continue;
                    // "cru" entra no índice; "texto" vai para a tela. O prefixo
                    // fica fora do índice, senão digitar "tutor" casaria com todos.
                    partes.push({
                        texto: slots[e].prefixo + val,
                        cru:   val,
                        nova:  slots[e].nova
                    });
                }

                valores.push({
                    texto:  rot,
                    busca:  semAcento(rot),
                    partes: partes,
                    obj:    registros[k],
                    id:     ids[k]
                });
            }
        }

        // ---------- MODO TEXTO: fallback sem tipo de dado ----------
        if (!modoObjeto) {
            var brutos = [
                paraArray(properties.campo),
                paraArray(properties.campo_2),
                paraArray(properties.campo_3)
            ];
            var vistos = new Set();

            for (var f = 0; f < brutos.length; f++) {
                for (var i = 0; i < brutos[f].length; i++) {
                    var v = brutos[f][i];
                    if (v === null || v === undefined) continue;
                    v = String(v).trim();
                    if (v === '' || vistos.has(v)) continue;
                    vistos.add(v);
                    valores.push({
                        texto: v, busca: semAcento(v),
                        partes: [], obj: null, id: null
                    });
                }
            }
        }

        carregou = true;
    }

    instance.data.valores  = valores;
    instance.data.carregou = carregou;

    // ============ 4. ÍNDICE DE BUSCA ============
    // A chave é o unique id do registro, não a posição no array. Se a lista
    // for reconstruída entre a indexação e a busca, o resultado continua
    // apontando para o registro certo.
    function chaveDe(item, pos) {
        return String(item.id || ('t' + pos));
    }

    function construirIndice(lista) {
        var porChave = new Map();
        for (var c = 0; c < lista.length; c++) {
            porChave.set(chaveDe(lista[c], c), lista[c]);
        }
        instance.data.porChave = porChave;

        if (typeof MiniSearch === 'undefined') {
            console.error('[autocomplete] MiniSearch não encontrado. ' +
                          'Usando filtro simples.');
            return null;
        }

        var mini = new MiniSearch({
            idField: 'id',
            fields: ['f0', 'f1', 'f2', 'f3'],
            storeFields: [],
            // Mesma normalização na indexação e na consulta:
            // é isso que faz "joao" achar "João".
            processTerm: function (termo) {
                var t = semAcento(termo);
                return t || null;
            },
            searchOptions: {
                prefix: true,           // "dom" acha "Domenico"
                fuzzy: FUZZY,           // "dominico" acha "Domenico"
                combineWith: 'AND',     // "nina joao" exige os dois
                boost: { f0: 3 }        // o rótulo pesa mais que os slots
            }
        });

        var docs = [];
        for (var i = 0; i < lista.length; i++) {
            docs.push({
                id: chaveDe(lista[i], i),
                f0: lista[i].texto,
                f1: lista[i].partes[0] ? lista[i].partes[0].cru : '',
                f2: lista[i].partes[1] ? lista[i].partes[1].cru : '',
                f3: lista[i].partes[2] ? lista[i].partes[2].cru : ''
            });
        }
        if (docs.length > 0) mini.addAll(docs);

        return mini;
    }

    // Só reconstrói quando os dados mudaram de verdade.
    function assinatura(lista) {
        if (lista.length === 0) return '0';
        var ult = lista[lista.length - 1];
        return lista.length + '|' +
               (lista[0].id || lista[0].texto) + '|' +
               (ult.id || ult.texto);
    }

    if (!carregou) {
        instance.data.mini       = null;
        instance.data.porChave   = new Map();
        instance.data.assinatura = null;
    } else {
        var assinaturaAtual = assinatura(valores);

        // Se o script do MiniSearch ainda não tinha carregado na primeira
        // execução, o índice nasceu nulo. Refaz assim que ele aparecer.
        var faltaIndice = !instance.data.mini &&
                          typeof MiniSearch !== 'undefined';

        if (instance.data.assinatura !== assinaturaAtual ||
            !instance.data.porChave || faltaIndice) {
            instance.data.mini       = construirIndice(valores);
            instance.data.assinatura = assinaturaAtual;
        } else {
            // Mesmo sem mudança textual, o Bubble pode recriar os objetos.
            // O mapa precisa apontar para os atuais.
            var mapaAtual = new Map();
            for (var mc = 0; mc < valores.length; mc++) {
                mapaAtual.set(chaveDe(valores[mc], mc), valores[mc]);
            }
            instance.data.porChave = mapaAtual;
        }
    }

    function buscar(termo) {
        var tudo = instance.data.valores || [];
        var t    = (termo || '').trim();

        if (t === '') return tudo.slice(0, MAX_VISIVEL);

        var mini = instance.data.mini;

        // Fallback sem a biblioteca: filtro simples pelo rótulo
        if (!mini) {
            var alvo = semAcento(t);
            var res0 = [];
            for (var i = 0; i < tudo.length && res0.length < MAX_VISIVEL; i++) {
                if (tudo[i].busca.indexOf(alvo) !== -1) res0.push(tudo[i]);
            }
            return res0;
        }

        var res   = mini.search(t);
        var lista = [];
        var mapa  = instance.data.porChave;

        for (var j = 0; j < res.length && lista.length < MAX_VISIVEL; j++) {
            var it = mapa ? mapa.get(String(res[j].id)) : null;
            if (it) lista.push(it);
        }

        // Rede de segurança: o índice casa por prefixo, então "menico" não
        // encontra "Domenico". Só roda quando não houve resultado nenhum.
        if (lista.length === 0 && properties.busca_no_meio !== false) {
            var alvo2 = semAcento(t);
            for (var m = 0; m < tudo.length && lista.length < MAX_VISIVEL; m++) {
                if (tudo[m].busca.indexOf(alvo2) !== -1) lista.push(tudo[m]);
            }
        }

        return lista;
    }

    // ============ 5. DROPDOWN ============
    function estaAberto() {
        return instance.data.box.classList.contains('ac-aberto');
    }

    function posicionar() {
        var inp = instance.data.input;
        var b   = instance.data.box;
        if (!inp || !b) return;

        // No celular o teclado virtual encolhe o visualViewport, mas não o
        // innerHeight. Sem isso o dropdown abre atrás do teclado.
        var vv = window.visualViewport;
        var alturaVisivel = vv ? vv.height    : window.innerHeight;
        var deslocamento  = vv ? vv.offsetTop : 0;

        var rect   = inp.getBoundingClientRect();
        var abaixo = alturaVisivel + deslocamento - rect.bottom;
        var acima  = rect.top - deslocamento;

        b.style.left  = rect.left + 'px';
        b.style.width = rect.width + 'px';

        if (abaixo < 160 && acima > abaixo) {
            b.style.top       = '';
            b.style.bottom    = (window.innerHeight - rect.top + DIST_INPUT) + 'px';
            b.style.maxHeight = Math.max(80, Math.min(ALTURA_MAX, acima - 12)) + 'px';
        } else {
            b.style.bottom    = '';
            b.style.top       = (rect.bottom + DIST_INPUT) + 'px';
            b.style.maxHeight = Math.max(80, Math.min(ALTURA_MAX, abaixo - 12)) + 'px';
        }
    }

    function mensagem(texto, comSpinner) {
        var div = document.createElement('div');
        div.className = 'ac-vazio';
        if (comSpinner) {
            var sp = document.createElement('span');
            sp.className = 'ac-spinner';
            div.appendChild(sp);
        }
        div.appendChild(document.createTextNode(texto));
        return div;
    }

    function renderizar(termo) {
        var b = instance.data.box;

        if (!instance.data.liberado) {
            b.replaceChildren(mensagem(
                'Digite pelo menos ' + instance.data.min + ' caracteres'));
            instance.data.filtrados = [];
            return;
        }

        if (!instance.data.carregou) {
            b.replaceChildren(mensagem('Carregando...', true));
            instance.data.filtrados = [];
            return;
        }

        var lista = buscar(termo);
        instance.data.filtrados = lista;
        instance.data.ativo     = -1;

        if (lista.length === 0) {
            b.replaceChildren(mensagem('Nenhum resultado'));
            var chave = semAcento((termo || '').trim());
            if (instance.data.ultimoVazio !== chave) {
                instance.data.ultimoVazio = chave;
                instance.triggerEvent('nada_encontrado');
            }
            return;
        }

        instance.data.ultimoVazio = null;

        var alvo = semAcento((termo || '').trim());
        var frag = document.createDocumentFragment();

        for (var j = 0; j < lista.length; j++) {
            var item = document.createElement('div');
            item.className = 'ac-item';
            item.setAttribute('role', 'option');
            item.dataset.indice = j;
            item.id = instance.data.id + '_op' + j;

            var linha = document.createElement('div');
            linha.className = 'ac-linha';

            var prim = document.createElement('span');
            prim.className = 'ac-p';

            // Nós de texto, NUNCA innerHTML: os valores vêm do banco.
            var t   = lista[j].texto;
            var pos = alvo === '' ? -1 : lista[j].busca.indexOf(alvo);

            if (pos === -1) {
                prim.appendChild(document.createTextNode(t));
            } else {
                prim.appendChild(document.createTextNode(t.slice(0, pos)));
                var neg = document.createElement('strong');
                neg.textContent = t.slice(pos, pos + alvo.length);
                prim.appendChild(neg);
                prim.appendChild(document.createTextNode(t.slice(pos + alvo.length)));
            }

            linha.appendChild(prim);
            item.appendChild(linha);

            var atual = linha;
            for (var p = 0; p < lista[j].partes.length; p++) {
                if (lista[j].partes[p].nova) {
                    atual = document.createElement('div');
                    atual.className = 'ac-linha';
                    item.appendChild(atual);
                }
                var sec = document.createElement('span');
                sec.className = 'ac-s';
                sec.textContent = lista[j].partes[p].texto;
                atual.appendChild(sec);
            }

            frag.appendChild(item);
        }

        b.replaceChildren(frag);
    }

    function abrir(termo) {
        renderizar(termo);
        posicionar();
        instance.data.box.classList.add('ac-aberto');
        if (instance.data.input) {
            instance.data.input.setAttribute('aria-expanded', 'true');
        }
    }

    function fechar() {
        instance.data.box.classList.remove('ac-aberto');
        if (instance.data.input) {
            instance.data.input.setAttribute('aria-expanded', 'false');
            instance.data.input.removeAttribute('aria-activedescendant');
        }
        instance.data.ativo = -1;
    }

    function destacar(novo) {
        var itens = instance.data.box.querySelectorAll('.ac-item');
        if (!itens.length) return;

        if (instance.data.ativo >= 0 && itens[instance.data.ativo]) {
            itens[instance.data.ativo].classList.remove('ac-ativo');
        }
        if (novo < 0) novo = itens.length - 1;
        if (novo >= itens.length) novo = 0;

        instance.data.ativo = novo;
        itens[novo].classList.add('ac-ativo');
        itens[novo].scrollIntoView({ block: 'nearest' });

        if (instance.data.input) {
            instance.data.input.setAttribute(
                'aria-activedescendant', itens[novo].id);
        }
    }

    function selecionar(indice) {
        var item = instance.data.filtrados[indice];
        var inp  = instance.data.input;
        if (!item || !inp) return;

        // silencioso: os eventos abaixo acionam o nosso próprio listener.
        // Sem a flag, ele trataria isso como digitação e reabriria a lista.
        instance.data.silencioso = true;
        inp.value = item.texto;
        inp.dispatchEvent(new Event('input',  { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        instance.data.silencioso = false;

        instance.publishState('valor_selecionado', item.texto);

        if (item.obj) {
            instance.publishState('item_selecionado', item.obj);
            instance.publishState('id_selecionado', item.id);
        }

        instance.data.temSelecao = true;

        instance.triggerEvent('selecionado');
        fechar();
    }

    // Exposta para a Action "Limpar seleção" poder chamar de fora.
    function limpar(dispararEvento) {
        var inp = instance.data.input;
        
        // Já estava vazio: não faz nada. Sem isso, dois elementos que se
        // limpam mutuamente entram em loop infinito.
        if (!instance.data.temSelecao && (!inp || inp.value === '')) {
            fechar();
            return; 
            }

        if (inp) {
            instance.data.silencioso = true;
            inp.value = '';
            inp.dispatchEvent(new Event('input',  { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            instance.data.silencioso = false;
        }

        instance.data.temSelecao = false;
        instance.publishState('valor_selecionado', '');
        instance.publishState('id_selecionado', '');
        instance.publishState('item_selecionado', null);

        fechar();

        if (dispararEvento) instance.triggerEvent('limpou');
    }

    instance.data.limpar = limpar;
    
    // Exposta para a Action "Definir seleção". Recebe o texto pronto do
    // Bubble — a action roda fora do update, onde o .get() não é confiável.
    function definir(registro, texto) {
        var inp = instance.data.input;

        var txt = (texto === null || texto === undefined) ? '' : String(texto);

        if (inp) {
            instance.data.silencioso = true;
            inp.value = txt;
            inp.dispatchEvent(new Event('input',  { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            instance.data.silencioso = false;
        }

        if (registro && typeof registro.get === 'function') {
            instance.publishState('valor_selecionado', txt);
            instance.publishState('item_selecionado', registro);
            instance.publishState('id_selecionado', registro.get('_id'));
            instance.data.temSelecao = true;
        } else {
            instance.publishState('valor_selecionado', '');
            instance.publishState('item_selecionado', null);
            instance.publishState('id_selecionado', '');
            instance.data.temSelecao = false;
        }

        fechar();
    }

    instance.data.definir = definir;

    // Preenchimento automático vindo do field item_inicial.
    // Não dispara 'selecionado': quem define já tem o próprio evento.
    function aplicarInicial(texto, id, obj) {
        var inp = instance.data.input;
        if (!inp) return;

        instance.data.silencioso = true;
        inp.value = (texto === null || texto === undefined) ? '' : String(texto);
        inp.dispatchEvent(new Event('input',  { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        instance.data.silencioso = false;

        if (id) {
            instance.publishState('valor_selecionado', String(texto));
            instance.publishState('item_selecionado', obj);
            instance.publishState('id_selecionado', id);
            instance.data.temSelecao = true;
        } else {
            instance.publishState('valor_selecionado', '');
            instance.publishState('item_selecionado', null);
            instance.publishState('id_selecionado', '');
            instance.data.temSelecao = false;
        }

        fechar();
    }

    // A liberação do carregamento acontece aqui.
    function aoDigitar() {
        if (instance.data.silencioso) return;

        var inp = instance.data.input;
        if (!inp) return;
        var val = inp.value;

        // Selecionou antes e agora o campo está vazio: a seleção morreu.
        if (instance.data.temSelecao && val.trim() === '') {
            instance.data.temSelecao = false;
            instance.publishState('valor_selecionado', '');
            instance.publishState('id_selecionado', '');
            instance.publishState('item_selecionado', null);
            instance.triggerEvent('limpou');
        }

        if (!instance.data.liberado) {
            if (val.trim().length >= instance.data.min) {
                instance.data.liberado = true;
                abrir(val);   // mostra "Carregando..." com spinner
            } else {
                abrir(val);   // mostra "Digite pelo menos N caracteres"
                return;
            }
        }

        // Publicar muda a propriedade "gatilho", e mudança de propriedade é o
        // único jeito documentado de fazer o update rodar de novo — que é onde
        // o .get() pode ser chamado com segurança. Publica UMA vez só: se
        // continuasse publicando a cada tecla, o Bubble refaria as consultas.
        if (!instance.data.carregou) {
            instance.publishState('termo_busca', val.trim());
            return;
        }

        abrir(val);
    }

    // ============ 6. HANDLERS ============
    var handlers = {
        onInput: function () {
            // Qualquer digitação encerra o preenchimento automático —
            // mesma regra do Initial content do Bubble.
            if (!instance.data.silencioso) instance.data.escolhaManual = true;
            aoDigitar();
        },
        onFocus: aoDigitar,
        onKeydown: function (ev) {
            if (ev.key === 'ArrowDown') {
                ev.preventDefault();
                if (!estaAberto()) aoDigitar();
                else destacar(instance.data.ativo + 1);
            } else if (ev.key === 'ArrowUp') {
                ev.preventDefault();
                if (estaAberto()) destacar(instance.data.ativo - 1);
            } else if (ev.key === 'Enter') {
                if (estaAberto() && instance.data.ativo >= 0) {
                    ev.preventDefault();
                    selecionar(instance.data.ativo);
                }
            } else if (ev.key === 'Escape' || ev.key === 'Tab') {
                fechar();
            }
        },
        onMousedownBox: function (ev) {
            var alvo = ev.target.closest ? ev.target.closest('.ac-item') : null;
            if (!alvo) return;
            ev.preventDefault();   // impede o blur antes do clique registrar
            selecionar(parseInt(alvo.dataset.indice, 10));
        },
        onDocMousedown: function (ev) {
            if (!estaAberto()) return;
            if (ev.target === instance.data.input) return;
            if (instance.data.box.contains(ev.target)) return;
            fechar();
        },
        onReposicionar: function () {
            if (estaAberto()) posicionar();
        }
    };

    function desligar() {
        var h = instance.data.handlers;
        var antigo = instance.data.input;
        if (!h) return;

        if (antigo) {
            antigo.removeEventListener('input',   h.onInput);
            antigo.removeEventListener('focus',   h.onFocus);
            antigo.removeEventListener('keydown', h.onKeydown);
        }
        if (instance.data.box) {
            instance.data.box.removeEventListener('mousedown', h.onMousedownBox);
        }
        document.removeEventListener('mousedown', h.onDocMousedown, true);
        window.removeEventListener('scroll', h.onReposicionar, true);
        window.removeEventListener('resize', h.onReposicionar);

        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', h.onReposicionar);
            window.visualViewport.removeEventListener('scroll', h.onReposicionar);
        }

        instance.data.handlers = null;
    }

    function ligar(inp) {
        instance.data.handlers = handlers;

        inp.removeAttribute('list');
        inp.setAttribute('autocomplete', 'off');
        inp.setAttribute('role', 'combobox');
        inp.setAttribute('aria-autocomplete', 'list');
        inp.setAttribute('aria-haspopup', 'listbox');
        inp.setAttribute('aria-expanded', 'false');
        inp.setAttribute('aria-controls', instance.data.id);

        inp.addEventListener('input',   handlers.onInput);
        inp.addEventListener('focus',   handlers.onFocus);
        inp.addEventListener('keydown', handlers.onKeydown);

        instance.data.box.addEventListener('mousedown', handlers.onMousedownBox);
        document.addEventListener('mousedown', handlers.onDocMousedown, true);
        window.addEventListener('scroll', handlers.onReposicionar, true);
        window.addEventListener('resize', handlers.onReposicionar);

        // Teclado virtual do celular
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handlers.onReposicionar);
            window.visualViewport.addEventListener('scroll', handlers.onReposicionar);
        }
    }

    // ============ 7. LOCALIZAR O INPUT E LIGAR ============
    if (!instance.data.box) return;

    var input = properties.id ? document.getElementById(properties.id) : null;

    if (!input) {
        console.warn('[autocomplete] Input com ID "' + properties.id + '" não ' +
                     'encontrado. Verifique o ID Attribute e se "Expose the option ' +
                     'to add an ID attribute" está ativo em Settings > General.');
        instance.publishState('indexados', valores.length);
        return;
    }

    // O update roda várias vezes e cada execução cria closures novas. Sem
    // religar, os listeners continuariam presos ao properties da primeira.
    desligar();
    instance.data.input = input;
    ligar(input);

    if (estaAberto()) {
        renderizar(input.value);
        posicionar();
    }

    // ============ 8. SELEÇÃO INICIAL — aplicação ============
    // Quando o item_inicial aponta para outro registro, isso é uma ação nova
    // do usuário em outro campo — o preenchimento volta a valer.
    if (instance.data.idInicial !== iniId) {
        instance.data.escolhaManual = false;
        aplicarInicial(iniTxt, iniId, iniObj);
        instance.data.idInicial = iniId;
    }

    instance.publishState('indexados', valores.length);
}