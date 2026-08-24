function(instance, context) {

    // Criar um id randomico para a lista (somente assim o usuario pode inserir mais de uma list na mesma pagina)
instance.data.id = "data_list" + Math.random().toString(36).substring(2,16);
    
   // Criamos a lista   
    let lista = document.createElement('datalist');
    // Atribuimos o ID usando nosso instance.data.id
    lista.id = instance.data.id;
 
    // Inserimos nossa lista no nosso documento HTML
    document.body.append(lista);
}