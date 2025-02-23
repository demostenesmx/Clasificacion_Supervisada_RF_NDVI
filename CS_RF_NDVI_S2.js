//*************************Clasificación supervisada mediante umbrales de NDVI con RF*********************/ 
//****************************************************************************************************************/
//===============================1.Capas del área de estudio, en la zona costera de la RBSK.=====================/

var ZN = ee.FeatureCollection ('projects/ee-mere10eloy/assets/ZN');
var ZS = ee.FeatureCollection ('projects/ee-mere10eloy/assets/ZS');

//=================================2. Superficie de cada zona de estudio.====================================/
var ZNarea= ZN.geometry().area().divide(10000);
var ZSarea= ZS.geometry().area().divide(10000);

//======================================2.1. Calculando superficie===============================/
print ('Superficie ZN ha', ZNarea);
print ('Superficie ZS ha', ZSarea);

//======================================3.Estimación de NDVI.==================================/

var ndvi = function (image) {
   var ndvi_img = image.normalizedDifference(['B8', 'B4'])
                      .rename('NDVI'); 
                     
   return image.addBands(ndvi_img); //Función para generar calculo de ndvi y regresar imagen con estimación
   };

//===================================4. Colección armmonizada de sentinel 2============================/

var S2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED");
var zonas = ee.FeatureCollection (ZN.merge(ZS));

//====================================5. Enmascaramiento de nubes.==================================/
function maskCloudAndShadowsSR(image) {
  var cloudProb = image.select('MSK_CLDPRB');
  var snowProb = image.select('MSK_SNWPRB');
  var cloud = cloudProb.lt(10);
  var scl = image.select('SCL'); 
  var shadow = scl.eq(3); // 3 = cloud shadow
  var cirrus = scl.eq(10); // 10 = cirrus
  
// Probabilidad de nubes <10% y clasificación de sombra de nubes.
  var mask = cloud.and(cirrus.neq(1)).and(shadow.neq(1));
  return image.updateMask(mask).select('B.*').multiply(0.0001) ;
}

//=====================================6. Filtrado de la colección armonizada.========================/
var filtered = S2
.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .filter(ee.Filter.date('2023-01-01', '2023-12-31'))
  .filter(ee.Filter.bounds(zonas))
  .map(maskCloudAndShadowsSR)
  .select('B.*');

var composite = filtered.map(ndvi).median().clip(zonas);

var ndvi_01 = composite.select('NDVI');

//==========================================7. Estableciendo umbrales de NDVI====================================/   

var NDVI_C1 = ndvi_01
         .where(ndvi_01 .gt(0).and(ndvi_01.lte (0.2)),  1) // Suelo y/o Agua;
         .where(ndvi_01 .gt(0.2).and(ndvi_01.lte (0.45)),  2) //Vegetación de baja densidad; 
         .where(ndvi_01 .gt(0.45).and(ndvi_01.lte(0.65)), 3)// Vegetación de densidad media baja;
         .where(ndvi_01 .gt(0.65).and(ndvi_01 .lte(0.8)), 4)// Vegetación de densidad media alta; y
         .where(ndvi_01 .gt(0.8).and(ndvi_01.lte(0.94)),5); // Vegetación de alta densidad.

//===============================8. Estadisticos descriptivos sobre NDVI para 2023.=============================/

  var reducer1 = ee.Reducer.mean(); 
var reducers = reducer1.combine({reducer2: ee.Reducer.median(), sharedInputs: true})
                       .combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true})
                       .combine({reducer2: ee.Reducer.variance(), sharedInputs: true})
                       .combine({reducer2: ee.Reducer.max(), sharedInputs: true})
                       .combine({reducer2: ee.Reducer.min(), sharedInputs: true});
                               
//============================================ZN_2023===============================================//

var results_01 =composite.select('NDVI').reduceRegion({reducer: reducers,
                                geometry: ZN,
                                scale: 30,
                                bestEffort: true});  
   
   print('Estadisticos_NDVI_ZN_2023',results_01);
   
//============================================ZS_2023===============================================//

var results_02 =composite.select('NDVI').reduceRegion({reducer: reducers,
                                geometry: ZS,
                                scale: 30,
                                bestEffort: true});   
   print('Estadisticos_NDVI_ZS_2023',results_02);
          
//============================9. Clasificación supervisada mediante RAndom Forest (RF)====================/

//=======================9.1. Datos de entrenameinto según densidad de cobertura vegetal.=====================/

var classes = SD.merge(VDB).merge(VDMB).merge(VDMA).merge(VDA); 

//========================9.2.Seleccionando propiedades y bandas para RF==================================7
var cobertura = classes.select('lc');
print(cobertura, 'Coberturas');

var bands = ['B2','B3','B4','B8','NDVI']; //bandas con resolución de 10m

var S2_01 = composite.select(bands); //composicion de de bandas

//=============================10. Ensamblando muestras para el modelo RF.===============================/
var samples = S2_01.sampleRegions({
  collection: classes, // Set of geometries selected for training
  properties: ['id'], // Label from each geometry
  scale: 10,
  geometries: true //Escala correspodniente a la colección S2
  }).randomColumn('random'); // creates a column with random numbers
  
  print(samples.select('random'),'muestra_azar');
  
  //1.==============HIstograma de frecuencias NDVI_ZN.===================/

// Definir las opciones de de visualización del histograma
var opciones = {
  //Título
  title: 'Histograma de Valores NDVI-ZN',
  // tamaño de letra
  fontSize: 15,
  //Título del eje horizontal
  hAxis: {title: 'Distribución Valores NDVI'},
  //Título del eje vertical
  vAxis: {title: 'Frecuencia'},
   minBucketWidth:(-1,0, 1),
  // Colores de las series
  series: {
    0: {color: 'green'},
    }};
 
// Creación del histograma y agregar las opciones de visualización.
 // Definir datos del histograma (imagen, región, resolución espacial en metros)
var histograma01 = ui.Chart.image.histogram(S2_01 , ZN, 10) 
    // Definir nombres de las series
    .setSeriesNames([ 'NDVI'])
    // Agregar las opciones de histograma definidas previamente
    .setOptions(opciones);
   
 // Mostrar histograma en la consola.
print(histograma01);

// Definir las opciones de de visualización del histograma
var opciones = {
  //Título
  title: 'Histograma de Valores NDVI-ZS',
  // tamaño de letra
  fontSize: 15,
  //Título del eje horizontal
  hAxis: {title: 'Distribución Valores NDVI'},
  //Título del eje vertical
  vAxis: {title: 'Frecuencia'},
   minBucketWidth:(-1,0, 1),
  // Colores de las series
  series: {
    0: {color: 'green'},
    }};
 
// Creación del histograma y agregar las opciones de visualización.
 // Definir datos del histograma (imagen, región, resolución espacial en metros)
var histograma02 = ui.Chart.image.histogram(S2_01 , ZS, 10) //  band01
    // Definir nombres de las series
    .setSeriesNames([ 'NDVI'])
    // Agregar las opciones de histograma definidas previamente
    .setOptions(opciones);
   
 
// Mostrar histograma en la consola.
print(histograma02);
  
//==============================11. Porcentaje de datos para entrenamiento y validación.===================/
var split = 0.8; // 80% para entrenamiento y el 20% para validación.
var training = samples.filter(ee.Filter.lt('random',split)); //Entrenameinto 80%
var testing = samples.filter(ee.Filter.gte('random', split)); //Validación 20 % Subset testing data

//= ===============================12. Imprimir para observar datos de variables=======================/
  print('Samples n =', samples.aggregate_count('.all'));
  print('Training n =', training.aggregate_count('.all'));
  print('Testing n =', testing.aggregate_count('.all'));
  
  Map.addLayer (training, {color: 'blue'}, 'Entrenamiento');
  Map.addLayer (testing, {color: 'red'}, 'Validacion');
  
//==========================13. Ejecución de clasificación con RF.======================================/  
var classifier = ee.Classifier.smileRandomForest(100).train({ 
  features: training.select(['B2','B3','B4','B8','NDVI', 'id']), //Bandas de entrenamiento a emplear y propiedad de los datos de entrenamiento.
  classProperty: 'id', //Extraer la propiedad de cobertura terrestre de las clases
  inputProperties: bands
  });//
  
print(classifier.explain(), 'Clasificador explicado');

//===========================14. Agregando banda clasificada a la colección armonizada================/

var clasificacionRF = S2_01.classify(classifier); 
print(clasificacionRF, 'Clasificación_RF');

//=================================15. Agregando clasificación al mapa.==============================/
Map.addLayer (clasificacionRF, {min: 0, max: 4,
palette:['#f6fffb','#e1ffbb','#9dff20','#2dff2c','#17bc05']}, 'clasificacion');

//======================16. Validación de exactitud y precisión de la clasificación.===============/
 //https://developers.google.com/earth-engine/apidocs/ee-classifier-confusionmatrix
 
//====Obtenga una matriz de confusión y precisión general para la muestra de entrenamiento.=====/
 var trainAccuracy = classifier.confusionMatrix();
 print('Matriz_error_entrenamiento', trainAccuracy);
 print('Precision_general_entrenamiento', trainAccuracy.accuracy());
  print('Coeficiente_Kappa', trainAccuracy .kappa());
  
//=====Obtenga una matriz de confusión y precisión general para la muestra de validación.======/ 
var validation = testing.classify(classifier);
  var testAccuracy = validation.errorMatrix('id', 'classification');//testConfusionMatrix
  print('Matriz_errores_validacion_RF: ', testAccuracy);
  print('Precision_general_validacion_RF: ', testAccuracy.accuracy());

var classed = S2_01.select(bands) // Seleccionar predictores
                    .classify(classifier);

//======================================17. Imprimir estimadores estadisticos.======================/

//=======================================17.1. Precision consumidor.================================/
print("Precision_consumidor", testAccuracy.consumersAccuracy());

//========================================17.2. Precision productor (sensibilidad).=================/ 
//                          y el complemento del error de omisión (1 − error de omisión).

print("Precision_productor", testAccuracy.producersAccuracy());

//======================================17.3. Coeficiente Kappa.====================================/
print('Coeficiente_Kappa', testAccuracy.kappa());

//=================================Lista de coberturas.============================================/
var classList= ['SD', 'VDB', 'VDMB', 'VDMA', 'VDA'];

//====================18. Convertir lista de JavaScript a lista de cadenas en GEE=====================/
var list = ee.List(classList.map(function(nombre) {
  return ee.String(nombre);
}));

//============================18.1Imprimir la lista en la consola
print(list);

//=============================19. Parametros de visualizacion.===================/
var visualization_01 = {
  bands: ['B4', 'B3', 'B2'], //4, 3, 2
  min: 0.0,
  max: 0.3,
};

//====================20. Agregar capas al mapa.====================================/
//{min:-0.66,max:0.97}
Map.addLayer (composite.clip(zonas), visualization_01, 'True Color (432)');
Map.addLayer (composite.select('NDVI'),imageVisParam, 'NDVI_2023');
Map.centerObject (RBSK, 10);

//==========================21. Exportar Resultados.============================/
//==================================================01
Export.image.toDrive(
{image:  composite.select('NDVI'), 
description: 'NDVI_2023_02', 
folder: 'GEE',
scale: 10,
region:zonas,
crs: 'EPSG:32616',
maxPixels: 1e13
});

//=====================================================02
Export.image.toDrive(
{image:  clasificacionRF, 
description: 'Clasificacion_RF_NDVI_2023', 
folder: 'GEE',
scale: 10,
region:zonas,
crs: 'EPSG:32616',
maxPixels: 1e13
});

//====================================================================03
//==============Exportar resultados de estimación de precision=================/
//Cree una característica con geometría nula y el valor que queremos exportar.
// Usa .array() para convertir Confusion Matrix en un Array para que pueda ser
// exportado en un archivo CSV
var fc = ee.FeatureCollection([
  ee.Feature(null, {
    'accuracy': testAccuracy.accuracy(),
    'matrix': testAccuracy.array()
  })
]);

print(fc, 'orden');
//=======================Exportando el arreglo de tabla generado.==============/
Export.table.toDrive({
  collection: fc,
  description: 'Accuracy_Assessment_Export',
  folder: 'GEE',
  fileNamePrefix: 'accuracy',
  fileFormat: 'CSV'
});

//=============================Convertir clasificación a vectores.==============/
var vectors =  clasificacionRF.reduceToVectors({
  geometry: zonas,
  crs: 'EPSG:32616',
  scale: 10,
  geometryType: 'polygon',
  eightConnected: false,
  labelProperty: 'NDVI',
    maxPixels: 1e13
//  reducer: ee.Reducer.median()
});

//============================Exportar archivo vector a archivo KML.============/
Export.table.toDrive({
  collection: vectors,
  description:'Vectors_Clasificacion',
  fileFormat: 'KML',
  folder: 'GEE',
});

//Fuente:
//https://developers-google-com.translate.goog/earth-engine/guides/exporting_tables?_x_tr_sl=en&_x_tr_tl=es&_x_tr_hl=es&_x_tr_pto=tc
//https://developers-google-com.translate.goog/earth-engine/guides/reducers_reduce_to_vectors?_x_tr_sl=en&_x_tr_tl=es&_x_tr_hl=es&_x_tr_pto=tc

//===========================22. Gráficos de superficie por clase============================/

//=================================================ZN==================================/
var palette = ['#f6fffb','#e1ffbb','#9dff20','#2dff2c','#17bc05'];

var nl = ee.FeatureCollection(classes);

var chart = ui.Chart.image.byClass({
  image: ee.Image.pixelArea().divide(10000)//.multiply(1e-6)// pixel area in km2
            .addBands(clasificacionRF.rename('classification')),
  classBand: 'classification',                     
  region: ZN,
  reducer: ee.Reducer.sum(),
  scale: 10*10,
  classLabels:classes.select('id'), //classList,
});
chart.setOptions({title:'Area por clase ZN', hAxis: {title: ''}, vAxis: {title: 'Area (ha)'},
                 colors: palette})
     .setChartType('ColumnChart');
     
print(chart, 'Superficie_clase_ZN');

//===================================================ZS====================================//

var palette = ['#f6fffb','#e1ffbb','#9dff20','#2dff2c','#17bc05'];

var nl = ee.FeatureCollection(classes);

var chart = ui.Chart.image.byClass({
  image: ee.Image.pixelArea().divide(10000)//.multiply(1e-6) // pixel area in km2
            .addBands(clasificacionRF.rename('classification')),
  classBand: 'classification',                     
  region: ZS,
  reducer: ee.Reducer.sum(),
  scale: 10*10,
  classLabels:classes.select('id')
});
chart.setOptions({title:'Area por clase ZS', hAxis: {title: ''}, vAxis: {title: 'Area en ha'},
                 colors: palette})
     .setChartType('ColumnChart');
     
print(chart, 'Superficie_clase_ZS');

//==================23. Estableciendo simbologia por clase al mapa como panel de coberturas.===================/

var palette_01 = ee.List(['#f6fffb','#e1ffbb','#9dff20','#2dff2c','#17bc05']);
var lc = ee.List([0, 1, 2, 3, 4]);

//=======================================01. Posición del  panel===========================/
var legend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 10px'
  }
});

//========================================02. Título de la leyenda==========================/
var legendTitle = ui.Label({
  value: 'Simbología',
  style: {
    fontWeight: 'bold',
    fontSize: '12px',
    margin: '0 0 4px 0',
    padding: '0'
    }
});

//===================================03. Agregar titulo al panel.=====================================/
legend.add(legendTitle);
    
// ==========================04. Crea y aplica estilo a 1er fila de la leyenda.=========================/
var makeRow = function(color, name) {
      
//=========================05. Crea la etiqueta que en realidad es el cuadro de color.======================/

      var colorBox = ui.Label({
        style: {
          backgroundColor: color,
          // Use padding to give the box height and width.
          padding: '8px',
          margin: '0 0 4px 0'
        }
      });
      
//==========================06. Cree la etiqueta rellena con el texto de descripción.========================/

      var description = ui.Label({
        value: name,
        style: {margin: '0 0 4px 6px'}
      });
      
      // return the panel
      return ui.Panel({
        widgets: [colorBox, description],
        layout: ui.Panel.Layout.Flow('horizontal')
      });
};

//========================================07. Paleta con colores.==================================/
var palette_02 =['#f6fffb','#e1ffbb','#9dff20','#2dff2c','#17bc05'];

//=======================================08. Nombres de la leyenda
var names = ['SD', 'VDB', 'VDMB', 'VDMA', 'VDA'];

//=========================================09. Agregar colores y nombres.============================/
for (var i = 0; i < 5; i++) {
  legend.add(makeRow(palette[i], names[i]));
  }  

//==========================================10. Agregar una leyenda al mapa.=======================/
//==================(alternativamente también puede imprimir la leyenda a la consola)  
Map.add(legend); 
Map.addLayer(POL_RBSK, {color: 'blue'}, 'RBSK');
