function(instance, properties, context) {

    // ===================================================================
    // Action: Definir seleção
    //
    // Recebe o registro E o texto pronto do Bubble. O texto vem separado
    // de propósito: a action roda FORA do update, e ali o .get() de
    // campos do registro não é confiável.
    // ===================================================================

    var d = instance.data;
    if (!d || !d.slim) return;

    var reg = properties.registro || null;
    var txt = properties.texto;
    txt = (txt === null || txt === undefined) ? '' : String(txt);

    // Sem registro = limpar.
    if (!reg || typeof reg.get !== 'function') {
        d.silencioso = true;
        try { d.slim.setSelected('', false); } catch (err) { if (err && err.message === 'not ready') throw err; }
        d.silencioso = false;

        d.temSelecao    = false;
        d.idSelecionado = null;
        d.idInicial     = null;

        instance.publishState('valor_selecionado', '');
        instance.publishState('id_selecionado', '');
        instance.publishState('item_selecionado', null);
        return;
    }

    var id = String(reg.get('_id'));

    // O SlimSelect só seleciona uma opção que exista NA LISTA dele.
    // Conferir contra d.porId não basta: o porId tem todos os
    // registros, enquanto a lista é cortada por max_lista — e com
    // carga adiada pode nem ter carregado ainda.
    var naLista = false;
    try {
        var dados = d.slim.getData() || [];
        for (var i = 0; i < dados.length; i++) {
            if (dados[i] && dados[i].value === id) { naLista = true; break; }
        }
    } catch (err) {
        if (err && err.message === 'not ready') throw err;
    }

    if (!naLista) {
        try {
            if (d.porId && d.porId.has(id)) {
                var it = d.porId.get(id);
                d.slim.addOption(it.opcao || {
                    value: id,
                    text:  it.texto,
                    html:  '<div class="sq-linha"><span class="sq-p">' +
                           d.esc(it.texto) + '</span></div>'
                });
            } else {
                d.slim.addOption({
                    value: id,
                    text:  txt,
                    html:  '<div class="sq-linha"><span class="sq-p">' +
                           d.esc(txt) + '</span></div>'
                });
            }
        } catch (err) {
            if (err && err.message === 'not ready') throw err;
            console.warn('[SlimSearch] falha ao injetar a opção:', err);
        }
    }

    d.silencioso = true;
    try {
        d.slim.setSelected(id, false);
    } catch (err) {
        // O Bubble usa exceção para dizer "dado ainda não pronto".
        // Engolir isso quebra a detecção de dependências e o update
        // pode nunca mais rodar quando o dado chegar.
        if (err && err.message === 'not ready') throw err;
        console.warn('[SlimSearch] falha ao definir seleção:', err);
    }
    d.silencioso = false;

    d.temSelecao    = true;
    d.idSelecionado = id;
    d.idInicial     = id;   // evita que o update reaplique item_inicial por cima

    instance.publishState('valor_selecionado', txt);
    instance.publishState('id_selecionado', id);
    instance.publishState('item_selecionado', reg);

    try { d.slim.close(); } catch (err) { if (err && err.message === 'not ready') throw err; }
}