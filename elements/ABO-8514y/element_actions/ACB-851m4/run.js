function(instance, properties, context) {
    if (typeof instance.data.limpar === 'function') {
        instance.data.limpar(true);
    }
}