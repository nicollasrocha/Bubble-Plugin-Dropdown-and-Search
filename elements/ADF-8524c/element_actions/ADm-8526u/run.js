function(instance, properties, context) {

    // ===================================================================
    // Action: Limpar seleção
    // ===================================================================

    var d = instance.data;
    if (!d || !d.slim) return;

    // Já estava vazio: não faz nada. Sem esta guarda, dois elementos
    // configurados para se limparem mutuamente entram em loop infinito.
    if (!d.temSelecao) {
        try { d.slim.close(); } catch (err) { if (err && err.message === 'not ready') throw err; }
        return;
    }

    d.silencioso = true;
    try {
        d.slim.setSelected('', false);
    } catch (err) {
        // O Bubble usa exceção para dizer "dado ainda não pronto".
        // Engolir isso quebra a detecção de dependências e o update
        // pode nunca mais rodar quando o dado chegar.
        if (err && err.message === 'not ready') throw err;
        console.warn('[SlimSearch] falha ao limpar:', err);
    }
    d.silencioso = false;

    d.temSelecao    = false;
    d.idSelecionado = null;
    // NÃO zerar aqui. Com d.idInicial = null, o próximo update veria
    // "idInicial diferente do item_inicial" e reaplicaria o registro —
    // a seleção voltaria sozinha logo após o Limpar.
    d.idInicial     = d.iniIdAtual;

    instance.publishState('valor_selecionado', '');
    instance.publishState('id_selecionado', '');
    instance.publishState('item_selecionado', null);

    try { d.slim.close(); } catch (err) { if (err && err.message === 'not ready') throw err; }

    instance.triggerEvent('limpou');
}