function(instance, properties, context) {

    // ===================================================================
    // SlimSearch v1.0 — update
    //
    // SlimSelect 4.0.7 fornece a UI. O motor de busca é o MiniSearch,
    // ligado pelo evento `search` do SlimSelect — que, ao contrário do
    // `searchFilter`, recebe o termo UMA vez e respeita a ORDEM do array
    // devolvido. É isso que preserva o ranking do MiniSearch.
    //
    // Verificado no fonte da 4.0.7: quando `events.search` existe, o
    // `searchFilter` nunca é chamado.
    // ===================================================================

    if (typeof SlimSelect === 'undefined') {
        console.error('[SlimSearch] SlimSelect não carregou. Confira os ' +
                      'headers do plugin (slimselect.iife.js).');
        // Sem isto o elemento ficaria invisível para sempre.
        if (instance.canvas && instance.canvas[0]) {
            instance.canvas[0].style.visibility = '';
        }
        return;
    }

    var d         = instance.data;
    var esc       = d.esc;
    var semAcento = d.semAcento;
    var paraArray = d.paraArray;

    // O "gatilho" não é lido: ele existe só para criar a dependência.
    // Você preenche esse field com o state termo_busca; quando o plugin
    // publica o state, o valor da property muda, e mudança de property
    // é o que faz o Bubble re-executar o update — que é onde o .get()
    // pode ser chamado com segurança.
    //
    // Por que aqui e não numa condicional: uma condicional precisa ser
    // avaliada durante o cálculo das properties. Se ela lê um state do
    // próprio elemento, o Bubble entra em laço e aborta com "Tried to
    // update an autorun while it was already updating, cyclic".
    // Uma property que lê um state é dependência simples, sem laço.
    var gatilho = properties.gatilho;   // eslint-disable-line no-unused-vars

    // Publicar o mesmo valor de novo faz o Bubble reavaliar dependências
    // sem necessidade — e é justamente esse tipo de cascata que produz
    // o erro "autorun ... cyclic". Aqui só publica o que mudou.
    if (!d.ultimoState) d.ultimoState = {};
    function publicar(nome, valor) {
        if (d.ultimoState[nome] === valor) return;
        d.ultimoState[nome] = valor;
        instance.publishState(nome, valor);
    }

    var FUZZY = 0.2;
    if (properties.fuzzy !== null && properties.fuzzy !== undefined) {
        var f = parseFloat(properties.fuzzy);
        if (!isNaN(f) && f >= 0 && f <= 1) FUZZY = f;
    }

    var MAX = parseInt(properties.max_lista, 10);
    if (isNaN(MAX) || MAX < 0) MAX = 50;   // 0 = sem limite

    var MIN = parseInt(properties.min_caracteres, 10);
    if (isNaN(MIN) || MIN < 0) MIN = 0;
    d.min = MIN;

    // Com MIN 0 a lista vem junto com a página; não há gatilho a esperar.
    if (MIN <= 0) d.liberado = true;

    var TXT_MIN = (properties.texto_minimo || 'Digite pelo menos {n} caracteres')
                    .replace('{n}', MIN);

    // Sem campo de busca não há onde digitar os N caracteres, então a
    // carga nunca é liberada e o dropdown fica travado na mensagem.
    if (MIN > 0 && properties.mostrar_busca === false && !d.avisouBusca) {
        d.avisouBusca = true;
        console.warn('[SlimSearch] min_caracteres = ' + MIN + ' com ' +
            '"mostrar_busca" desligado: o usuário não tem onde digitar, ' +
            'então a lista nunca carrega. Ligue mostrar_busca ou use ' +
            'min_caracteres = 0.');
    }

    // ================================================================
    // 1. MONTAR OS VALORES A PARTIR DO BUBBLE
    // ================================================================
    var valores  = [];
    var carregou = false;

    if (d.liberado) {
        var registros = paraArray(properties.origem);

        if (registros.length > 0 && properties.rotulo) {

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

            // ---- verificação de alinhamento ----
            // As listas dos slots casam com origem por POSIÇÃO. Sem prova
            // de que a ordem é a mesma, um registro exibiria o dado de
            // outro — e agora esses dados também entram na BUSCA, então
            // um desalinhamento faria "João" encontrar o pet errado.
            var temSlot = false;
            for (var ts = 0; ts < slots.length; ts++) {
                if (slots[ts].lista.length > 0) temSlot = true;
            }

            var chaves   = paraArray(properties.verificar);
            var alinhado = false;

            if (!temSlot) {
                alinhado = true;
            } else if (chaves.length === 0) {
                console.warn('[SlimSearch] O campo "verificar" está vazio. ' +
                    'Preencha com a MESMA busca de origem, terminando em ' +
                    ":each item's unique id. Slots desativados.");
            } else if (chaves.length !== registros.length) {
                console.warn('[SlimSearch] "verificar" tem ' + chaves.length +
                    ' itens e origem tem ' + registros.length +
                    '. Precisam ser a MESMA busca, com os MESMOS filtros e ' +
                    'a MESMA ordenação. Slots desativados.');
            } else {
                alinhado = true;
                for (var c = 0; c < chaves.length; c++) {
                    if (String(chaves[c]) !== String(ids[c])) {
                        alinhado = false;
                        console.warn('[SlimSearch] Desalinhamento na posição ' +
                            c + '. Slots desativados — dado errado é pior ' +
                            'que dado ausente.');
                        break;
                    }
                }
            }

            if (!alinhado) {
                for (var z = 0; z < slots.length; z++) slots[z].lista = [];
            }

            // ---- montagem ----
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
                    // "cru" entra no índice de busca; "texto" vai para a tela.
                    // O prefixo fica FORA do índice: senão digitar "tutor"
                    // casaria com todos os registros.
                    partes.push({
                        texto: slots[e].prefixo + val,
                        cru:   val,
                        // pré-normalizado: o fallback de substring
                        // rodava semAcento() em cada parte a cada
                        // busca sem resultado.
                        busca: semAcento(val),
                        nova:  slots[e].nova
                    });
                }

                valores.push({
                    texto:  rot,
                    busca:  semAcento(rot),
                    partes: partes,
                    obj:    registros[k],
                    id:     String(ids[k])
                });
            }
        }
        // Só considerar carregado quando registros realmente vieram.
        // Antes bastava o "rotulo" estar preenchido — e com o gatilho
        // isso é fatal: a property muda no instante em que publicamos
        // o termo, o update roda ANTES de o Bubble devolver a busca, e
        // as buscas pendentes seriam resolvidas com lista vazia,
        // mostrando "Nenhum resultado" em vez de esperar.
        // O caso legítimo de lista vazia é coberto pelo prazo em
        // aguardarDados().
        carregou = registros.length > 0;
    }

    d.valores  = valores;
    d.carregou = carregou;

    // O handler de busca é registrado UMA vez, na criação do
    // SlimSelect: tudo que ele lê por closure fica congelado no
    // primeiro update. Por isso o que a busca precisa vive em
    // instance.data, que é sempre o atual.
    d.max          = MAX;
    d.buscaNoMeio  = properties.busca_no_meio !== false;
    d.txtMin       = TXT_MIN;

    // ================================================================
    // 2. OPÇÃO NO FORMATO DO SLIMSELECT
    // ================================================================
    // `html` é innerHTML no SlimSelect — tudo escapado.
    function montarHtml(item) {
        var h = '<div class="sq-linha"><span class="sq-p">' +
                esc(item.texto) + '</span>';
        var aberta = true;

        for (var p = 0; p < item.partes.length; p++) {
            if (item.partes[p].nova) {
                if (aberta) { h += '</div>'; aberta = false; }
                h += '<div class="sq-linha">';
                aberta = true;
            }
            h += '<span class="sq-s">' + esc(item.partes[p].texto) + '</span>';
        }
        if (aberta) h += '</div>';
        return h;
    }

    // Sob demanda: com 10.000 registros e MAX 50, gerar o HTML de
    // todos seria 10.000 strings para exibir 50. O objeto fica
    // memorizado no item, então cada um é montado no máximo uma vez.
    function montarOpcao(item) {
        if (!item.opcao) {
            item.opcao = {
                value: item.id,
                text:  item.texto,   // usado na busca nativa e no title
                html:  montarHtml(item)
            };
        }
        return item.opcao;
    }

    // ================================================================
    // 3. ÍNDICE MINISEARCH
    // ================================================================
    // f0 = rótulo (o que o usuário mais busca) — por isso o boost.
    // f1..f3 = os slots. É isto que permite digitar o nome do TUTOR e
    // encontrar o ANIMAL. O SlimSelect sozinho não faz isso: o
    // searchFilter nativo dele olha só o option.text.
    function construirIndice(lista) {
        var porId = new Map();
        for (var c = 0; c < lista.length; c++) porId.set(lista[c].id, lista[c]);
        d.porId = porId;

        if (typeof MiniSearch === 'undefined') {
            console.error('[SlimSearch] MiniSearch não encontrado. ' +
                          'Caindo para filtro simples (sem fuzzy).');
            return null;
        }

        var mini = new MiniSearch({
            idField: 'id',
            fields: ['f0', 'f1', 'f2', 'f3'],
            storeFields: [],
            // A MESMA normalização na indexação e na consulta.
            // É isto que faz "joao" encontrar "João".
            processTerm: function (termo) {
                var t = semAcento(termo);
                return t || null;
            },
            searchOptions: {
                prefix: true,        // "dom" acha "Domenico"
                combineWith: 'AND',  // "nina joao" exige os dois
                boost: { f0: 3 },    // o rótulo pesa mais que os slots
                // Fuzzy por termo, não global. Em número, "1236" ficaria
                // a 1 caractere de 1234/1235/1237 e a busca por uma ficha
                // devolveria a lista inteira. Em termo curto acontece o
                // mesmo com nomes. Só vale a pena de 4 letras em diante.
                fuzzy: function (termo) {
                    if (FUZZY <= 0) return false;
                    if (/\d/.test(termo)) return false;
                    if (termo.length < 4) return false;
                    return FUZZY;
                }
            }
        });

        var docs = [];
        for (var i = 0; i < lista.length; i++) {
            docs.push({
                id: lista[i].id,
                f0: lista[i].texto,
                f1: lista[i].partes[0] ? lista[i].partes[0].cru : '',
                f2: lista[i].partes[1] ? lista[i].partes[1].cru : '',
                f3: lista[i].partes[2] ? lista[i].partes[2].cru : ''
            });
        }
        if (docs.length > 0) mini.addAll(docs);
        return mini;
    }

    // A assinatura decide quando o índice é reconstruído. Levar em
    // conta só tamanho + primeiro + último id era insuficiente: trocar
    // um registro do meio, ou renomear um mantendo o mesmo id, passava
    // despercebido — e a busca continuava encontrando pelo nome antigo.
    // Aqui entra tudo que é pesquisável, condensado num hash FNV-1a
    // para não montar uma string gigante a cada update.
    function assinatura(lista) {
        var hash = 2166136261;

        function misturar(txt) {
            var s = String(txt == null ? '' : txt);
            for (var j = 0; j < s.length; j++) {
                hash ^= s.charCodeAt(j);
                hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) +
                        (hash << 8) + (hash << 24)) >>> 0;
            }
            hash = (hash ^ 124) >>> 0;   // separador entre campos
        }

        for (var i = 0; i < lista.length; i++) {
            misturar(lista[i].id);
            misturar(lista[i].busca);
            for (var p = 0; p < lista[i].partes.length; p++) {
                misturar(lista[i].partes[p].cru);
            }
        }

        return lista.length + '|' + (hash >>> 0);
    }

    var assinaturaAtual = assinatura(valores);
    var faltaIndice = !d.mini && typeof MiniSearch !== 'undefined' && valores.length > 0;

    if (d.assinatura !== assinaturaAtual || faltaIndice) {
        d.mini       = construirIndice(valores);
        d.assinatura = assinaturaAtual;
        d.dadosNovos = true;
    } else {
        // Mesmo sem mudança textual o Bubble pode recriar os objetos.
        // O mapa precisa apontar para os atuais, senão item_selecionado
        // devolve um registro morto.
        var mapa = new Map();
        for (var mc = 0; mc < valores.length; mc++) mapa.set(valores[mc].id, valores[mc]);
        d.porId = mapa;
    }

    // ================================================================
    // 4. BUSCA
    // ================================================================
    function limitar(arr) {
        var m = d.max;
        return m > 0 ? arr.slice(0, m) : arr;
    }

    // Item placeholder — precisa ser SEMPRE o primeiro da lista.
    // Um <select> nativo single seleciona o índice 0 sozinho; sem este
    // item vazio na frente, o primeiro registro real aparece escolhido
    // assim que os dados chegam, sem o usuário ter clicado em nada.
    //
    // text vazio de propósito: com ele vazio o SlimSelect cai no
    // `settings.placeholderText` para a caixa fechada (confirmado em
    // render.placeholder()), e a linha na lista fica em branco,
    // funcionando como "limpar seleção".
    function opcaoPlaceholder() {
        return { placeholder: true, value: '', text: '' };
    }


    function catalogo() {
        var out = [opcaoPlaceholder()];
        var atuais = d.valores || [];
        var lista = limitar(atuais);
        for (var i = 0; i < lista.length; i++) out.push(montarOpcao(lista[i]));

        // Se o item selecionado ficou fora do corte, ele precisa existir
        // no catálogo — senão o SlimSelect perde a seleção ao limpar a busca.
        var selId = d.idSelecionado;
        if (selId && d.max > 0 && atuais.length > d.max) {
            var achou = false;
            for (var j = 0; j < lista.length; j++) {
                if (lista[j].id === selId) { achou = true; break; }
            }
            if (!achou && d.porId && d.porId.has(selId)) {
                out.splice(1, 0, montarOpcao(d.porId.get(selId)));
            }
        }
        return out;
    }

    // Os resultados de busca SUBSTITUEM os dados do SlimSelect. Sem o
    // placeholder na frente, o primeiro resultado seria auto-selecionado
    // enquanto o usuário ainda está digitando.
    // Lista vazia é devolvida crua: com 1 item o SlimSelect acharia que
    // há resultado e não mostraria "Nenhum resultado".
    function comPlaceholder(arr) {
        return arr.length === 0 ? [] : [opcaoPlaceholder()].concat(arr);
    }

    function buscar(t) {
        if (t === '') return catalogo();

        var atuais = d.valores || [];
        var out    = [];
        var mini   = d.mini;

        if (!mini) {
            var alvo = semAcento(t);
            for (var i = 0; i < atuais.length; i++) {
                if (atuais[i].busca.indexOf(alvo) !== -1) out.push(montarOpcao(atuais[i]));
                if (d.max > 0 && out.length >= d.max) break;
            }
            return comPlaceholder(out);
        }

        // A ordem devolvida pelo MiniSearch é a ordem que o SlimSelect
        // vai renderizar — o ranking sobrevive.
        var res = mini.search(t);
        for (var j = 0; j < res.length; j++) {
            if (d.max > 0 && out.length >= d.max) break;
            var it = d.porId.get(String(res[j].id));
            if (it) out.push(montarOpcao(it));
        }

        // Rede de segurança: o índice casa por prefixo, então "menico"
        // não acharia "Domenico". Só roda quando não veio nada.
        if (out.length === 0 && d.buscaNoMeio) {
            var alvo2 = semAcento(t);
            for (var m = 0; m < atuais.length; m++) {
                if (d.max > 0 && out.length >= d.max) break;
                var v = atuais[m];
                var casou = v.busca.indexOf(alvo2) !== -1;
                if (!casou) {
                    for (var pp = 0; pp < v.partes.length; pp++) {
                        if (v.partes[pp].busca.indexOf(alvo2) !== -1) {
                            casou = true; break;
                        }
                    }
                }
                if (casou) out.push(montarOpcao(v));
            }
        }

        if (out.length === 0) {
            var chave = semAcento(t);
            if (d.ultimoVazio !== chave) {
                d.ultimoVazio = chave;
                instance.publishState('termo_busca', t);
                instance.triggerEvent('nada_encontrado');
            }
        } else {
            d.ultimoVazio = null;
        }

        return comPlaceholder(out);
    }

    // Só uma busca fica pendente por vez. Enquanto digita "j", "jo",
    // "joa", "joao", só a última interessa — as anteriores são
    // encerradas com lista vazia para não ficarem penduradas.
    // O prazo cobre o caso em que o Bubble devolve uma lista
    // legitimamente vazia: sem ele o dropdown ficaria em "Carregando..."
    // para sempre, já que "carregou" nunca vira true.
    function aguardarDados(termo) {
        encerrarPendente([]);

        return new Promise(function (res) {
            var prazo = setTimeout(function () {
                if (d.pendente && d.pendente.res === res) {
                    d.pendente = null;
                    res([]);
                }
            }, 10000);

            d.pendente = { termo: termo, res: res, prazo: prazo };
        });
    }

    function encerrarPendente(resultado) {
        if (!d.pendente) return;
        clearTimeout(d.pendente.prazo);
        var p = d.pendente;
        d.pendente = null;
        p.res(resultado || []);
    }
    // Pode devolver array (síncrono) ou Promise. A Promise é o que
    // sustenta o carregamento adiado: o SlimSelect mostra "carregando"
    // enquanto o Bubble vai buscar os dados.
    function aoBuscar(termo) {
        var t = (termo || '').trim();

        if (!d.liberado) {
            if (t.length >= d.min) {
                d.liberado = true;
                // O state serve como DADO (o termo digitado).
                instance.publishState('termo_busca', t);
                // O evento é o GATILHO. Uma condicional que lesse o
                // state do próprio elemento para definir uma property
                // dele mesmo cria dependência circular no Bubble
                // ("Tried to update an autorun while it was already
                // updating, cyclic"). O evento roda em outro ciclo:
                // workflow -> custom state da página -> condicional.
                instance.triggerEvent('pedir_dados');
                return aguardarDados(t);
            }
            return Promise.reject(d.txtMin);
        }

        if (!d.carregou) {
            return aguardarDados(t);
        }

        return buscar(t);
    }

    // ================================================================
    // 5. SETTINGS
    // ================================================================
    function montarSettings() {
        var abertura = properties.posicao_abertura || 'auto';

        // O SlimSelect só reposiciona o dropdown no scroll quando
        // openPosition é 'auto'. Com 'up'/'down' + contentPosition
        // 'fixed', ele ficaria parado enquanto a página rola e
        // descolaria do campo. Nesse caso caímos para 'absolute'.
        var posConteudo = properties.posicao_conteudo ||
                          (abertura === 'auto' ? 'fixed' : 'absolute');

        if (abertura !== 'auto' && posConteudo === 'fixed') {
            console.warn('[SlimSearch] posicao_abertura "' + abertura +
                '" com posicao_conteudo "fixed": o dropdown não acompanha ' +
                'o scroll da página nessa combinação. Use "auto" ou ' +
                'mude posicao_conteudo para "absolute".');
        }

        // Largura do dropdown.
        // Sem contentWidth, o SlimSelect copia a largura do .ss-main.
        // Com o padding das Bubble properties, o .ss-main fica DENTRO
        // do padding e nasce mais estreito que a caixa visível — o
        // dropdown sairia menor que o campo. Aqui passamos a largura
        // externa real. Feito por setting, não mexendo no layout: mover
        // o padding para dentro do .ss-main quebrava a altura, porque o
        // height:100% dele deixa de resolver quando o canvas não tem
        // altura definida, e o texto sobe para o topo.
        var largura = null;
        if (properties.usar_estilo_do_bubble && instance.canvas &&
            instance.canvas[0]) {
            try {
                var w = instance.canvas[0].getBoundingClientRect().width;
                if (w > 0) largura = Math.round(w) + 'px';
            } catch (err) { if (err && err.message === 'not ready') throw err; }
        }

        return {
            disabled:          !!properties.desabilitado,
            showSearch:        properties.mostrar_busca !== false,
            focusSearch:       properties.focar_busca !== false,
            keepSearch:        !!properties.manter_busca,
            searchPlaceholder: properties.placeholder_busca || 'Buscar',
            searchText:        properties.texto_sem_resultado || 'Nenhum resultado',
            searchingText:     properties.texto_carregando || 'Carregando...',
            searchHighlight:   properties.destacar !== false,
            placeholderText:   properties.placeholder || 'Selecione',
            allowDeselect:     properties.permitir_limpar !== false,
            closeOnSelect:     properties.fechar_ao_escolher !== false,
            showOptionTooltips: !!properties.tooltips,
            openPosition:      abertura,
            modal:             properties.modal || 'mobile',
            modalTitle:        properties.titulo_modal || '',
            contentPosition:   posConteudo,
            contentWidth:      largura || '',
            timeoutDelay:      parseInt(properties.atraso, 10) || 200
        };
    }

    // ================================================================
    // 6. ESTILO
    // ================================================================
    // Uma var() com valor inválido não cai em fallback: o navegador
    // descarta a declaração inteira. Um único campo Color vazio vindo
    // como "[object Object]" apagaria fundo, borda e altura máxima do
    // dropdown de uma vez. Por isso tudo passa por validação.
    function cor(valor, campo) {
        if (valor === null || valor === undefined) return null;
        var v = String(valor).trim();
        if (v === '') return null;
        if (v.indexOf('[object') === 0) {
            console.warn('[SlimSearch] O campo "' + campo + '" não devolveu ' +
                'uma cor e sim um objeto. Ignorado (o padrão será usado). ' +
                'Confira se o campo está configurado como Editor: Color.');
            return null;
        }
        if (typeof CSS !== 'undefined' && CSS.supports &&
            !CSS.supports('color', v)) {
            console.warn('[SlimSearch] O campo "' + campo + '" tem um valor ' +
                'que não é uma cor CSS válida (' + v + '). Ignorado.');
            return null;
        }
        return v;
    }

    function medida(valor, unidade) {
        if (valor === null || valor === undefined || valor === '') return null;
        var n = parseFloat(valor);
        if (isNaN(n)) return null;
        return n + (unidade || 'px');
    }

    // O dropdown é anexado ao document.body, fora do canvas — então as
    // variáveis precisam ir nos DOIS lugares, senão só a caixa fechada
    // recebe o tema.
    function aplicarEstilo() {
        // Com usar_estilo_do_bubble ligado, a fonte definida na aba
        // nativa do Bubble (Font style) vale também para o dropdown —
        // que fica no document.body e não herdaria nada sozinho.
        var tamBubble = null;
        var fonteBubble = null;
        if (properties.usar_estilo_do_bubble && properties.bubble) {
            var b = properties.bubble;
            try {
                if (typeof b.font_size === 'function') {
                    var fs = parseFloat(b.font_size());
                    if (!isNaN(fs)) tamBubble = fs + 'px';
                }
            } catch (err) { if (err && err.message === 'not ready') throw err; }
            try {
                if (typeof b.font_face === 'function') {
                    var ff = String(b.font_face() || '').split(':::')[0];
                    if (ff) fonteBubble = ff;
                }
            } catch (err) { if (err && err.message === 'not ready') throw err; }
        }

        var vars = {
            // usadas pelo CSS da lib
            '--ss-primary-color':     cor(properties.cor_primaria, 'cor_primaria'),
            '--ss-bg-color':          cor(properties.cor_fundo, 'cor_fundo'),
            '--ss-font-color':        cor(properties.cor_texto, 'cor_texto'),
            '--ss-border-color':      cor(properties.cor_borda, 'cor_borda'),
            '--ss-placeholder-color': cor(properties.cor_placeholder, 'cor_placeholder'),
            '--ss-disabled-color':    cor(properties.cor_desabilitado, 'cor_desabilitado'),
            '--ss-main-height':       medida(properties.altura),
            '--ss-content-height':    medida(properties.altura_lista),
            '--ss-option-height':     medida(properties.altura_opcao),
            '--ss-animation-timing':  medida(properties.animacao, 's'),

            // usadas pelo CSS próprio (sempre com fallback)
            '--sq-bg':          cor(properties.cor_fundo, 'cor_fundo'),
            '--sq-borda':       cor(properties.cor_borda, 'cor_borda'),
            '--sq-texto':       cor(properties.cor_texto, 'cor_texto'),
            '--sq-texto-2':     cor(properties.cor_texto_secundario, 'cor_texto_secundario'),
            '--sq-hover':       cor(properties.cor_hover, 'cor_hover'),
            '--sq-destaque':    cor(properties.cor_destaque, 'cor_destaque'),
            '--sq-placeholder': cor(properties.cor_placeholder, 'cor_placeholder'),
            '--sq-seta':        cor(properties.cor_icone, 'cor_icone'),
            '--sq-limpar-cor':  cor(properties.cor_icone_limpar, 'cor_icone_limpar'),
            '--sq-altura-lista': medida(properties.altura_lista),
            '--sq-raio-lista':  medida(properties.raio_lista),
            '--sq-tam-p':       medida(properties.tamanho_principal) || tamBubble,
            '--sq-tam-s':       medida(properties.tamanho_secundario),
            '--sq-peso-p':      properties.peso_principal || null,
            '--sq-peso-s':      properties.peso_secundario || null,
            '--sq-padding-v':   medida(properties.padding_vertical),
            // espaçamento dos itens da lista
            '--sq-op-pad-v':    medida(properties.padding_item_v),
            '--sq-op-pad-h':    medida(properties.padding_item_h),
            '--sq-op-gap':      medida(properties.espaco_entre_itens),
            '--sq-op-raio':     medida(properties.raio_item),
            '--sq-op-min':      medida(properties.altura_opcao),

            // barra de busca
            '--sq-busca-altura': medida(properties.altura_busca),
            '--sq-busca-pad':    medida(properties.padding_busca),
            '--sq-busca-pad-v':  medida(properties.padding_busca_v),
            '--sq-busca-pad-h':  medida(properties.padding_busca_h),

            // linhas dentro do item
            '--sq-gap-h':  medida(properties.espaco_horizontal),
            '--sq-gap-v':  medida(properties.espaco_entre_linhas),
            '--sq-alinha': properties.alinhamento_vertical || null,
            '--sq-quebra': properties.quebrar_linha ? 'wrap' : null,
            '--sq-nowrap': properties.quebrar_linha ? 'normal' : null,

            // Por padrão a caixa ocupa 100% da altura do elemento.
            // Desmarcando, ela volta a crescer conforme o conteúdo.
            '--sq-caixa-altura': properties.altura_automatica === false
                ? 'auto' : null
        };

        // No modo nativo, quem define altura e espaçamento é a div
        // externa do Bubble. Um mínimo de 40px aqui dentro faria a
        // caixa transbordar o padding do Bubble e desalinhar o texto.
        if (properties.usar_estilo_do_bubble) {
            // min 0 para a caixa não exigir 40px e transbordar o padding
            // do Bubble; padding-v 0 porque o padding já vem de fora.
            // A altura continua 100%: é o que mantém o texto no centro.
            vars['--sq-caixa-min'] = '0';
            vars['--sq-padding-v'] = '0';
        }

        var alvos = [instance.canvas[0]];        if (d.slim && d.slim.render && d.slim.render.content &&
            d.slim.render.content.main) {
            alvos.push(d.slim.render.content.main);
        }

        for (var a = 0; a < alvos.length; a++) {
            for (var k in vars) {
                if (vars[k]) alvos[a].style.setProperty(k, vars[k]);
                else alvos[a].style.removeProperty(k);
            }
        }

        var fonteFinal = properties.fonte || fonteBubble;
        if (fonteFinal) {
            instance.canvas[0].style.fontFamily = fonteFinal;
            if (alvos[1]) alvos[1].style.fontFamily = fonteFinal;
        }
    }

    // ================================================================
    // 6b. BORDA E ÍCONE
    // ================================================================
    // A borda do .ss-main é `1px solid var(--ss-border-color)` fixa no
    // CSS da lib — largura e estilo não têm variável. Por isso vai
    // inline, que também sobrevive caso o slimselect.css falhe.
    function aplicarVisual() {
        if (!d.slim || !d.slim.render || !d.slim.render.main) return;
        var main = d.slim.render.main.main;
        if (!main) return;

        // Com as Bubble properties (Borders, Background, Padding, Box
        // shadow) ligadas, quem desenha a caixa é a div externa do
        // Bubble. Se o .ss-main também desenhasse, ficariam duas bordas
        // e dois fundos, um dentro do outro. Aqui ele fica transparente.
        if (properties.usar_estilo_do_bubble) {
            main.style.border       = 'none';
            main.style.background   = 'transparent';
            main.style.borderRadius = '0';
            main.style.boxShadow    = 'none';
            main.style.padding      = '0';
        } else {
            var estilo = properties.borda_estilo || 'solid';
            var larg   = parseFloat(properties.borda_largura);
            if (isNaN(larg) || larg < 0) larg = 1;

            if (estilo === 'none' || larg === 0) {
                main.style.borderStyle = 'none';
                main.style.borderWidth = '0';
            } else {
                main.style.border = larg + 'px ' + estilo + ' ' +
                    (cor(properties.cor_borda, 'cor_borda') || '#d5dbe0');
            }

            // Sempre aplicado: sem isto o raio cairia no 4px da lib e
            // ficaria diferente do raio da lista (8px).
            main.style.borderRadius = medida(properties.raio_borda) || '8px';

            var padH = medida(properties.padding_horizontal);
            if (padH) main.style.paddingLeft = main.style.paddingRight = padH;
        }

        // ---- ícone ----
        var svg = d.slim.render.main.arrow && d.slim.render.main.arrow.main;

        if (!properties.icone) {
            // Sem ícone customizado: devolve a seta nativa.
            if (svg) svg.style.display = '';
            if (d.iconeEl && d.iconeEl.parentNode) {
                d.iconeEl.parentNode.removeChild(d.iconeEl);
                d.iconeEl = null;
            }
            return;
        }

        if (svg) svg.style.display = 'none';

        if (!d.iconeEl) {
            d.iconeEl = document.createElement('i');
            d.iconeEl.setAttribute('aria-hidden', 'true');
            if (svg && svg.parentNode) {
                svg.parentNode.insertBefore(d.iconeEl, svg.nextSibling);
            } else {
                main.appendChild(d.iconeEl);
            }
        }

        d.classeIcone       = properties.icone;
        d.classeIconeAberto = properties.icone_aberto || '';
        d.girarIcone        = !!properties.girar_icone;

        var corIc = cor(properties.cor_icone, 'cor_icone');
        if (corIc) d.iconeEl.style.color = corIc;
        var tamIc = medida(properties.tamanho_icone);
        if (tamIc) d.iconeEl.style.fontSize = tamIc;

        d.pintarIcone(d.abertoAgora);
    }

    // ---- ícone de limpar (o "x") ----
    // O onclick fica no container (.ss-deselect), não no SVG — então
    // esconder o SVG e pôr o ícone dentro preserva o clique.
    function aplicarIconeLimpar() {
        if (!d.slim || !d.slim.render || !d.slim.render.main) return;
        var des = d.slim.render.main.deselect;
        if (!des || !des.main) return;

        if (!properties.icone_limpar) {
            if (des.svg) des.svg.style.display = '';
            if (d.limparEl && d.limparEl.parentNode) {
                d.limparEl.parentNode.removeChild(d.limparEl);
                d.limparEl = null;
            }
            return;
        }

        if (des.svg) des.svg.style.display = 'none';

        if (!d.limparEl) {
            d.limparEl = document.createElement('i');
            d.limparEl.setAttribute('aria-hidden', 'true');
            des.main.appendChild(d.limparEl);
        }

        d.limparEl.className = 'sq-limpar ' + properties.icone_limpar;

        var c = cor(properties.cor_icone_limpar, 'cor_icone_limpar');
        if (c) d.limparEl.style.color = c;
        var t = medida(properties.tamanho_icone_limpar);
        if (t) d.limparEl.style.fontSize = t;
    }

    // Rede de segurança do "x" da caixa fechada.
    // O handler interno da lib seleciona o primeiro item da lista (o
    // nosso placeholder) para representar "nada selecionado". Se por
    // qualquer motivo isso não acontecer, a seleção fica pendurada.
    // Aqui conferimos depois do handler dela e limpamos se preciso.
    function ligarLimpezaForcada() {
        if (d.limpezaLigada) return;
        if (!d.slim || !d.slim.render || !d.slim.render.main) return;
        var des = d.slim.render.main.deselect;
        if (!des || !des.main) return;

        d.limpezaLigada = true;
        des.main.addEventListener('click', function () {
            // setTimeout: roda depois do handler da lib, para só agir
            // quando ela realmente não limpou.
            setTimeout(function () {
                if (!d.temSelecao) return;   // a lib deu conta

                if (properties.debug) {
                    console.log('[SlimSearch] o "x" não limpou pela lib; ' +
                        'forçando a limpeza.');
                }

                d.silencioso = true;
                try { d.slim.setSelected('', false); } catch (err) { if (err && err.message === 'not ready') throw err; }
                d.silencioso = false;

                d.temSelecao    = false;
                d.idSelecionado = null;
                d.idInicial     = d.iniIdAtual;
                publicar('valor_selecionado', '');
                publicar('id_selecionado', '');
                instance.publishState('item_selecionado', null);
                instance.triggerEvent('limpou');
            }, 0);
        });
    }

    // Troca a classe conforme aberto/fechado. Fica em instance.data
    // porque os callbacks afterOpen/afterClose são registrados uma vez
    // só, na criação, e precisam enxergar a versão atual.
    d.pintarIcone = function (aberto) {
        if (!d.iconeEl) return;
        var base = (aberto && d.classeIconeAberto)
            ? d.classeIconeAberto
            : (d.classeIcone || '');
        d.iconeEl.className = 'sq-icone ' + base +
            (d.girarIcone && aberto && !d.classeIconeAberto ? ' sq-aberto' : '');
    };

    // ================================================================
    // 7. CRIAR / ATUALIZAR O SLIMSELECT
    // ================================================================
    // O SlimSelect só consegue selecionar uma opção que exista NA LISTA
    // dele. Conferir contra d.porId não serve: o porId tem todos os
    // registros, enquanto a lista é cortada por max_lista. Um
    // item_inicial fora do corte (um "last item", por exemplo) faria o
    // setSelected falhar em silêncio e o campo ficar no placeholder.
    function garantirOpcao(id, textoFallback) {
        if (!id || !d.slim) return;

        var dados = [];
        try {
            dados = d.slim.getData() || [];
        } catch (err) {
            if (err && err.message === 'not ready') throw err;
        }

        for (var i = 0; i < dados.length; i++) {
            if (dados[i] && dados[i].value === id) return;   // já está lá
        }

        try {
            if (d.porId && d.porId.has(id)) {
                d.slim.addOption(montarOpcao(d.porId.get(id)));
            } else {
                var txt = String(textoFallback == null ? '' : textoFallback);
                d.slim.addOption({
                    value: id,
                    text:  txt,
                    html:  '<div class="sq-linha"><span class="sq-p">' +
                           esc(txt) + '</span></div>'
                });
            }
            if (properties.debug) {
                console.log('[SlimSearch] opção', id, 'não estava na lista; inserida.');
            }
        } catch (err) {
            if (err && err.message === 'not ready') throw err;
            console.warn('[SlimSearch] falha ao inserir a opção:', err);
        }
    }

    // setData SUBSTITUI os dados do SlimSelect, e as opções que
    // montamos não carregam a marca de "selecionada" — então cada
    // recarga apagava a seleção da tela enquanto o estado interno
    // continuava com o item. Isso fazia parecer que o campo não
    // aceitava seleção e que o valor "sumia" sozinho ao editar o
    // registro. Aqui a seleção é reposta logo depois.
    function trocarDados(novosDados) {
        var manter = d.idSelecionado;

        d.silencioso = true;
        try {
            d.slim.setData(novosDados);

            if (manter) {
                garantirOpcao(manter, d.ultimoState && d.ultimoState.valor_selecionado);
                d.slim.setSelected(manter, false);
            }
        } catch (err) {
            if (err && err.message === 'not ready') throw err;
            console.warn('[SlimSearch] falha ao trocar os dados:', err);
        } finally {
            d.silencioso = false;
        }

        if (properties.debug) {
            console.log('[SlimSearch] trocarDados | itens:', novosDados.length,
                '| seleção reposta:', manter || '(nenhuma)',
                '| getSelected agora:', JSON.stringify(idsSelecionados()));
        }
    }

    // A v4 NÃO tem updateSettings — esse método era da v2, de onde veio
    // o plugin de exemplo. Aqui as settings são alteradas direto no
    // objeto público `settings`, que a lib relê a cada render.
    // "disabled" é exceção: tem métodos próprios.
    function aplicarSettings(novo) {
        var s = d.slim && d.slim.settings;
        if (!s) return;

        // Estas mudam a estrutura do que já está desenhado, então
        // exigem um redesenho para valer.
        var estruturais = {
            placeholderText: 1, showSearch: 1, allowDeselect: 1,
            searchPlaceholder: 1, modal: 1
        };
        var precisaRedesenhar = false;

        for (var k in novo) {
            if (k === 'disabled') continue;
            if (s[k] === novo[k]) continue;
            if (estruturais[k]) precisaRedesenhar = true;
            s[k] = novo[k];
        }

        if (d.desabilitado !== novo.disabled) {
            d.desabilitado = novo.disabled;
            try {
                if (novo.disabled) d.slim.disable();
                else d.slim.enable();
            } catch (err) {
                if (err && err.message === 'not ready') throw err;
                console.warn('[SlimSearch] falha ao alternar disabled:', err);
            }
        }

        if (precisaRedesenhar) {
            trocarDados(d.slim.getData());
        }
    }

    // O SlimSelect calcula a posição do dropdown no instante em que
    // abre e só recalcula em scroll e resize da janela. Se o layout se
    // reacomodar por outro motivo — conteúdo que terminou de carregar,
    // um grupo que apareceu, uma imagem que entrou — o campo muda de
    // lugar e o dropdown fica para trás, solto no meio da tela.
    // Aqui a posição do campo é vigiada enquanto está aberto; quando
    // ela muda, um evento de scroll faz a lib recalcular.
    function vigiarPosicao(ligar) {
        if (!ligar) {
            if (d.vigia) { cancelAnimationFrame(d.vigia); d.vigia = null; }
            return;
        }
        if (d.vigia) return;

        var main = d.slim && d.slim.render && d.slim.render.main
                 ? d.slim.render.main.main : null;
        if (!main) return;

        var anterior = null;
        var passo = function () {
            var r = main.getBoundingClientRect();
            var agora = Math.round(r.top) + ':' + Math.round(r.left) +
                        ':' + Math.round(r.width);
            if (anterior !== null && anterior !== agora) {
                var ev;
                try {
                    ev = new Event('scroll');
                } catch (err) {
                    ev = document.createEvent('Event');
                    ev.initEvent('scroll', false, false);
                }
                window.dispatchEvent(ev);
                if (properties.debug) {
                    console.log('[SlimSearch] campo mudou de lugar; ' +
                                'reposicionando o dropdown.');
                }
            }
            anterior = agora;
            d.vigia = requestAnimationFrame(passo);
        };
        d.vigia = requestAnimationFrame(passo);
    }

    function idsSelecionados() {
        if (!d.slim) return [];
        try { return d.slim.getSelected() || []; } catch (err) { return []; }
    }

    function publicarSelecao(dispararEvento) {
        var brutos = idsSelecionados();
        var sel = brutos.filter(function (v) { return v !== ''; });

        if (properties.debug) {
            console.log('[SlimSearch] publicarSelecao | getSelected():',
                JSON.stringify(brutos),
                '| após filtrar vazios:', JSON.stringify(sel),
                '| temSelecao antes:', d.temSelecao,
                '| dispararEvento:', dispararEvento);
        }

        if (sel.length === 0) {
            var tinha = d.temSelecao;
            d.temSelecao    = false;
            d.idSelecionado = null;
            // O usuário limpou de propósito. Sem isto, o bloco do
            // item_inicial veria "idInicial diferente do atual" no
            // próximo update e reaplicaria o registro — a seleção
            // voltaria sozinha logo depois do clique no X.
            d.idInicial     = d.iniIdAtual;
            publicar('valor_selecionado', '');
            publicar('id_selecionado', '');
            instance.publishState('item_selecionado', null);
            if (tinha && dispararEvento) instance.triggerEvent('limpou');
            return;
        }

        var id  = String(sel[0]);
        var it  = d.porId ? d.porId.get(id) : null;

        d.temSelecao    = true;
        d.idSelecionado = id;

        publicar('id_selecionado', id);
        publicar('valor_selecionado', it ? it.texto : '');
        if (it && it.obj) instance.publishState('item_selecionado', it.obj);

        if (dispararEvento) instance.triggerEvent('selecionado');
    }

    if (!d.slim) {
        var settingsIniciais = montarSettings();
        d.slim = new SlimSelect({
            select: d.selectEl,
            // Nunca começar com lista vazia: sem o placeholder a caixa
            // nasce sem texto e o primeiro registro é auto-selecionado
            // assim que os dados chegam.
            data: (d.liberado && carregou) ? catalogo() : [opcaoPlaceholder()],
            settings: settingsIniciais,
            events: {
                search: aoBuscar,
                afterChange: function () {
                    if (d.silencioso) {
                        if (properties.debug) {
                            console.log('[SlimSearch] afterChange IGNORADO ' +
                                '(silencioso = true). Se isto aparecer ao ' +
                                'clicar no X, a flag ficou presa.');
                        }
                        return;
                    }
                    if (properties.debug) console.log('[SlimSearch] afterChange');
                    publicarSelecao(true);
                },
                afterOpen: function () {
                    d.abertoAgora = true;
                    vigiarPosicao(true);
                    if (d.pintarIcone) d.pintarIcone(true);
                    publicar('aberto', true);
                    instance.triggerEvent('abriu');
                },
                afterClose: function () {
                    d.abertoAgora = false;
                    vigiarPosicao(false);
                    if (d.pintarIcone) d.pintarIcone(false);
                    publicar('aberto', false);
                    instance.triggerEvent('fechou');
                },
                error: function (err) {
                    console.error('[SlimSearch]', err);
                }
            }
        });
        d.settingsStr = JSON.stringify(settingsIniciais);
        // Registrado na criação para o primeiro update não disparar um
        // enable()/disable() desnecessário.
        d.desabilitado = settingsIniciais.disabled;
        d.dadosNovos  = true;
    } else {
        var novo = montarSettings();
        var str  = JSON.stringify(novo);
        if (d.settingsStr !== str) {
            d.settingsStr = str;
            aplicarSettings(novo);
        }
    }

    // Só refaz o visual quando alguma property visual mudou. Antes
    // cada update relia dezenas de properties, chamava CSS.supports e
    // reescrevia CSS variables e DOM — trabalho desperdiçado quando só
    // os dados mudaram.
    var visualStr = JSON.stringify([
        properties.usar_estilo_do_bubble, properties.altura_automatica,
        properties.cor_primaria, properties.cor_fundo, properties.cor_texto,
        properties.cor_texto_secundario, properties.cor_hover,
        properties.cor_destaque, properties.cor_placeholder,
        properties.cor_desabilitado, properties.cor_borda,
        properties.altura, properties.altura_lista, properties.altura_opcao,
        properties.raio_lista, properties.raio_borda, properties.raio_item,
        properties.padding_vertical, properties.padding_horizontal,
        properties.padding_item_v, properties.padding_item_h,
        properties.espaco_entre_itens, properties.espaco_horizontal,
        properties.espaco_entre_linhas, properties.alinhamento_vertical,
        properties.quebrar_linha, properties.tamanho_principal,
        properties.tamanho_secundario, properties.peso_principal,
        properties.peso_secundario, properties.animacao, properties.fonte,
        properties.borda_largura, properties.borda_estilo,
        properties.altura_busca, properties.padding_busca,
        properties.padding_busca_v, properties.padding_busca_h,
        properties.icone, properties.icone_aberto, properties.girar_icone,
        properties.cor_icone, properties.tamanho_icone,
        properties.icone_limpar, properties.cor_icone_limpar,
        properties.tamanho_icone_limpar
    ]);

    if (d.visualStr !== visualStr) {
        d.visualStr = visualStr;
        aplicarEstilo();
        aplicarVisual();
        aplicarIconeLimpar();
    }
    ligarLimpezaForcada();

    // ---- dados ----
    if (d.dadosNovos && d.liberado && carregou) {
        trocarDados(catalogo());
        d.dadosNovos = false;

        // O registro selecionado pode ter sido EDITADO (outro nome,
        // outra raça). Sem isto, o rótulo na caixa e o valor_selecionado
        // ficariam com o texto antigo.
        if (d.idSelecionado && d.porId && d.porId.has(d.idSelecionado)) {
            var atual = d.porId.get(d.idSelecionado);
            publicar('valor_selecionado', atual.texto);
            if (atual.obj) instance.publishState('item_selecionado', atual.obj);
        }
    }

    // ---- resolver a busca que estava esperando os dados ----
    if (carregou && d.pendente) {
        var termoPendente = d.pendente.termo;
        try {
            encerrarPendente(buscar(termoPendente));
        } catch (err) {
            // O Bubble usa exceção para dizer "dado ainda não pronto".
            // Engolir isso quebra a detecção de dependências e o update
            // pode nunca mais rodar quando o dado chegar.
            if (err && err.message === 'not ready') throw err;
            console.error('[SlimSearch] falha ao resolver a busca:', err);
            encerrarPendente([]);
        }
    }

    // ================================================================
    // 8. SELEÇÃO INICIAL
    // ================================================================
    var iniObj = properties.item_inicial || null;
    var iniId  = null;
    var iniTxt = null;

    if (iniObj && typeof iniObj.get === 'function' && properties.rotulo) {
        iniId  = String(iniObj.get('_id'));
        iniTxt = iniObj.get(properties.rotulo);
    }

    // Guardado para o publicarSelecao e para as actions saberem qual é
    // o item_inicial vigente quando o usuário limpa.
    d.iniIdAtual = iniId;

    if (d.idInicial !== iniId) {
        d.idInicial = iniId;
        d.silencioso = true;

        try {
            if (iniId) {
                // Com carga adiada os dados podem não existir ainda. A opção é
                // injetada para o campo já mostrar o valor certo.
                garantirOpcao(iniId, iniTxt);
                d.slim.setSelected(iniId, false);
                d.temSelecao    = true;
                d.idSelecionado = iniId;
                publicar('id_selecionado', iniId);
                publicar('valor_selecionado', String(iniTxt == null ? '' : iniTxt));
                instance.publishState('item_selecionado', iniObj);
            } else {
                d.slim.setSelected('', false);
                d.temSelecao    = false;
                d.idSelecionado = null;
                publicar('id_selecionado', '');
                publicar('valor_selecionado', '');
                instance.publishState('item_selecionado', null);
            }
        } catch (err) {
            // O Bubble usa exceção para dizer "dado ainda não pronto".
            // Engolir isso quebra a detecção de dependências e o update
            // pode nunca mais rodar quando o dado chegar.
            if (err && err.message === 'not ready') throw err;
            console.warn('[SlimSearch] falha ao aplicar item_inicial:', err);
        } finally {
            // finally é essencial: sem ele, um erro aqui deixaria a flag
            // presa em true e o publicarSelecao sairia na primeira linha
            // para sempre — o X pararia de limpar.
            d.silencioso = false;
        }
    }

    if (properties.debug) {
        console.log('[SlimSearch] update | itens:', valores.length,
            '| carregou:', carregou,
            '| silencioso:', d.silencioso,
            '| temSelecao:', d.temSelecao,
            '| idSelecionado:', d.idSelecionado,
            '| idInicial:', d.idInicial,
            '| iniIdAtual:', d.iniIdAtual);

        // Medidas reais: se o texto estiver fora do centro, a resposta
        // está aqui — compare as alturas e o padding de cada camada.
        try {
            var cvEl = instance.canvas[0];
            var mnEl = d.slim && d.slim.render && d.slim.render.main
                     ? d.slim.render.main.main : null;
            var pai  = cvEl.parentElement;
            var med  = function (el) {
                if (!el) return '(ausente)';
                var r = el.getBoundingClientRect();
                var s = window.getComputedStyle(el);
                return Math.round(r.height) + 'px alto, topo ' +
                       Math.round(r.top) + ', padding ' +
                       s.paddingTop + '/' + s.paddingBottom;
            };
            console.log('[SlimSearch] alturas | pai:', med(pai),
                '|| canvas:', med(cvEl), '|| caixa:', med(mnEl));

            // Altura real das opções. Compare antes e depois de digitar:
            // se mudar, algo dentro do item está crescendo com a busca.
            var lista = d.slim && d.slim.render && d.slim.render.content
                      ? d.slim.render.content.list : null;
            if (lista) {
                var ops = lista.querySelectorAll('.ss-option');
                var hs  = [];
                for (var oi = 0; oi < ops.length && oi < 5; oi++) {
                    hs.push(Math.round(ops[oi].getBoundingClientRect().height));
                }
                console.log('[SlimSearch] altura das opções (primeiras 5):',
                    hs.join(', ') || '(lista fechada)',
                    '| com destaque:',
                    lista.querySelector('mark') ? 'sim' : 'não');
            }
        } catch (err) { if (err && err.message === 'not ready') throw err; }
    }

    publicar('indexados', valores.length);
    publicar('carregado', !!carregou);

    // Pronto: agora pode aparecer.
    instance.canvas[0].style.visibility = '';
}