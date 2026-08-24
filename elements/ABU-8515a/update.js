function(instance, properties, context) {

    // ===== HELPER: normaliza uma propriedade do Bubble em array JS =====
    // NÃO envolver em try/catch — quebraria o mecanismo "not ready" do Bubble.
    function paraArray(campo) {
        if (!campo) return [];

        // Bubble List
        if (typeof campo.length === 'function' && typeof campo.get === 'function') {
            var n = campo.length();
            if (!n) return [];
            return campo.get(0, n) || [];
        }

        // Fallback: array JS comum
        if (Array.isArray(campo)) return campo;

        return [];
    }

    // ===== 1. CARREGAR TODOS OS DADOS ANTES DE TOCAR NO DOM =====
    // Se algum dado ainda não chegou, o Bubble aborta aqui e roda a função
    // de novo depois. Como o DOM ainda não foi alterado, nada fica pela metade.
    var brutos = [
        paraArray(properties.campo),
        paraArray(properties.campo_2),
        paraArray(properties.campo_3)
    ];

    // ===== 2. NORMALIZAR + DEDUPLICAR =====
    var unicos = new Set(); // O(1) por item, contra O(n) do indexOf

    for (var f = 0; f < brutos.length; f++) {
        var arr = brutos[f];
        for (var i = 0; i < arr.length; i++) {
            var v = arr[i];
            if (v === null || v === undefined) continue;

            v = String(v).trim();   // trim agora em TODOS os campos
            if (v === '') continue; // descarta strings vazias

            unicos.add(v);
        }
    }

    // ===== 3. LOCALIZAR ELEMENTOS =====
    var lista = document.getElementById(instance.data.id);
    if (!lista) {
        console.warn('[datalist] <datalist> não encontrada. initialize rodou?');
        return;
    }

    var input = properties.id ? document.getElementById(properties.id) : null;

    if (!input) {
        console.warn('[datalist] Input com ID "' + properties.id + '" não encontrado. ' +
                     'Verifique o ID Attribute e se "Expose the option to add an ID attribute" ' +
                     'está ativo em Settings > General.');
        // Segue populando a lista — o input pode aparecer depois.
    } else if (input.getAttribute('list') !== instance.data.id) {
        input.setAttribute('list', instance.data.id);
    }

    // ===== 4. RENDERIZAR EM UMA ÚNICA OPERAÇÃO =====
    var fragmento = document.createDocumentFragment();

    unicos.forEach(function (valor) {
        var opt = document.createElement('option');
        opt.value = valor;
        fragmento.appendChild(opt);
    });

    // replaceChildren limpa e insere de uma vez só (sem jQuery, sem reflow duplo)
    lista.replaceChildren(fragmento);

    // ===== 5. ESTADO =====
    instance.publishState('indexados', unicos.size);
}