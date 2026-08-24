function(instance, properties, context) {
    if (typeof instance.data.definir === 'function') {
        instance.data.definir(properties.registro, properties.texto);
    }
}