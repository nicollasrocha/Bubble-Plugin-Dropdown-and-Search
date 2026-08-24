function(instance, context) {
  


    instance.data.id = 'ac_' + Math.random().toString(36).substring(2, 12);

    // CSS injetado uma vez por página. Os valores configuráveis vêm de CSS
    // variables definidas no container de cada instância — assim dois
    // dropdowns na mesma página podem ter estilos diferentes.
    if (!document.getElementById('ac_estilos_globais')) {
        var estilo = document.createElement('style');
        estilo.id = 'ac_estilos_globais';
        estilo.textContent = [
            '.ac-box{',
            '  position:fixed;',
            '  z-index:2147483000;',
            '  display:none;',
            '  box-sizing:border-box;',
            '  background:#fff;',
            '  border:1px solid #d5dbe0;',
            '  border-radius:8px;',
            '  box-shadow:0 6px 24px rgba(16,24,40,.12);',
            '  overflow-y:auto;',
            '  overscroll-behavior:contain;',
            '  padding:4px;',
            '  font-family:var(--ac-fonte,Ubuntu),-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
            '  color:#1f2933;',
            '  filter:none !important;',
            '}',
            '.ac-box.ac-aberto{display:block;}',
            '.ac-item{padding:8px 12px;border-radius:6px;cursor:pointer;}',
            '.ac-item:hover,.ac-item.ac-ativo{background:#eef4f6;}',
            '.ac-linha{display:flex;align-items:baseline;gap:8px;min-width:0;}',
            '.ac-p{',
            '  font-size:var(--ac-tam-p,15px);',
            '  font-weight:var(--ac-peso-p,500);',
            '  line-height:1.35;color:#1f2933;',
            '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
            '}',
            '.ac-p strong{font-weight:700;color:#0d7b8a;}',
            '.ac-s{',
            '  font-size:var(--ac-tam-s,13px);',
            '  font-weight:var(--ac-peso-s,400);',
            '  line-height:1.35;color:#7b8794;',
            '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
            '}',
            '.ac-vazio{',
            '  display:flex;align-items:center;gap:10px;',
            '  padding:10px 12px;color:#8b959e;font-style:italic;',
            '  cursor:default;font-size:var(--ac-tam-p,15px);',
            '}',
            '.ac-spinner{',
            '  width:14px;height:14px;flex:none;box-sizing:border-box;',
            '  border:2px solid #d9e0e5;',
            '  border-top-color:#0d7b8a;',
            '  border-radius:50%;',
            '  animation:ac-gira .7s linear infinite;',
            '}',
            '@keyframes ac-gira{to{transform:rotate(360deg)}}',
            '@media (prefers-reduced-motion: reduce){',
            '  .ac-spinner{animation-duration:2.5s;}',
            '}'
        ].join('\n');
        document.head.appendChild(estilo);
    }

    var box = document.createElement('div');
    box.id = instance.data.id;
    box.className = 'ac-box';
    box.setAttribute('role', 'listbox');
    document.body.appendChild(box);

    instance.data.box       = box;
    instance.data.valores   = [];
    instance.data.filtrados = [];
    instance.data.ativo     = -1;
    instance.data.input     = null;
    instance.data.handlers  = null;
}