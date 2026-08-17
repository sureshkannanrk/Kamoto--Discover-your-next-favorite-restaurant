'use strict';

const fs = require('fs');
const path = require('path');

const imageMap = {
  AVARTANA: 'https://www.itchotels.com/content/dam/itchotels/in/umbrella/itc/hotels/itcgrandchola-chennai/images/overview/dining/hotel-listing-card/avartana-open-kitchen.png',
  ANISE: 'https://lh3.googleusercontent.com/k_ljVk_11tk3nqe_mXPr-J4kQauRfFLhLOYjPfz3bp6uisOgrCEksEBAfeofGLvCbHRZ6MUBUUV2N0yV4rj94UKiR4POlZU85KfEOghq=s750',
  'MAINLAND CHINA': 'https://files.yappe.in/place/full/asia-kitchen-by-mainland-china-1805884.webp',
  'ENTE KERALAM': 'https://img.restaurantguru.com/w550/h367/r5d3-Ente-Keralam-Poes-Garden-interior-2022-10-10.jpg',
  'THE TONGA': 'https://www.itchotels.com/content/dam/itchotels/in/umbrella/itc/hotels/itcgrandchola-chennai/images/overview/dining/hotel-listing-card/pan-asian-cafe-edo.png',
  BUKHARA: 'https://www.itchotels.com/content/dam/itchotels/in/umbrella/itc/hotels/itcgrandchola-chennai/images/overview/dining/hotel-listing-card/peshawri.png',
  'BOMBAY BRUNCH': 'https://files.yappe.in/place/full/bombay-brasserie-adyar-3182369.webp',
  'SHREE ANNAPOORNA': 'https://www.sreeannapoorna.com/cdn/shop/files/Roast_fc78f518-e712-45ab-b8d4-95ca7115d906.jpg?v=1696665637',
  'AACHI MESS': 'https://b.zmtcdn.com/data/pictures/chains/8/21534668/17313142858731bf95-6125-4bd2-a839-dd230aeb3ef4.jpg',
  'JUNIOR KUPPANNA': 'https://kuppanna.com/cdn/shop/files/Artboard-01.png?v=1633680855',
  "THAT'S Y FOOD": 'https://www.thatsyfoodcbe.in/images/gallery-img3.jpg',
  'BIRD ON TREE': 'https://b.zmtcdn.com/data/pictures/chains/6/3000126/a511d997caff20dafa36e123a294855d.jpg',
  'LA CABANA': 'https://assets.simplotel.com/simplotel/image/upload/w_5000,h_3337/x_0,y_281,w_5000,h_2775,r_0,c_crop/q_80,w_1600,dpr_1,f_auto,fl_progressive,c_limit/hotel-park-elanza-coimbatore/la-cabana-restaurant',
  'AFGHAN GRILL': 'https://assets.simplotel.com/simplotel/image/upload/x_0,y_193,w_1804,h_1014,r_0,c_crop/q_80,w_900,dpr_1,f_auto,fl_progressive,c_limit/the-residency-towers-coimbatore/Afghan_Grill_-_Twilight_02',
  'LAKSHMI HOTELS': 'https://static.wixstatic.com/media/2ef73d_819e574555a44173ba7dbf072d4193bd~mv2.jpg/v1/fill/w_768,h_427,al_c,lg_1,q_80,enc_avif,quality_auto/eng%252520lakshmi%252520hotels_edited_edited.jpg',
  'HOTEL SRI ANNAPOORNA': 'https://b.zmtcdn.com/data/pictures/chains/1/18736421/c4bbbf38001c17ec2661bd80168849b8.jpg',
  'SRI KALIAMMAN MESS': 'https://b.zmtcdn.com/data/reviews_photos/8b9/3273347151b658fc57138901cba168b9_1630855307.jpg',
  '11 TO 11': 'https://b.zmtcdn.com/data/reviews_photos/2cd/91042ce71c050e967e52564136b0f2cd_1730547485.jpg',
  'SREE SABAREES': 'https://sreesabarees.com/assets/imgs/TOWNHALL%201.jpg',
  'MURUGAN IDLI SHOP': 'https://upload.wikimedia.org/wikipedia/commons/6/67/Murugan_Idli_Shop_Nanganallur_Chennai.jpg',
  'KONAR MESS': 'https://i0.wp.com/travelmax.in/wp-content/uploads/2023/08/1.-Konar-Mess.jpg?ssl=1',
  'KUMAR MESS': 'https://img.restaurantguru.com/reviews/small/w550/h367/957800.jpg',
  'MODERN RESTAURANT': 'https://modernrestaurant.in/img/about/fromt.png',
  'GRAND GARDENIA': 'https://assets.simplotel.com/simplotel/image/upload/w_5000,h_3333/x_0,y_260,w_5000,h_2813,r_0,c_crop,q_80,fl_progressive/w_900,f_auto,c_fit/grand-gardenia-tiruchirappalli/Hotel_Kannappa_Restaurant_11_ulgbzs',
  'SANGAM HOTEL': 'https://trichy.com/wp-content/uploads/2013/09/sangam-255x144.jpg',
  'HOTEL FEMINA': 'https://dynamic.tourtravelworld.com/hotel-images/photo-big/dir_10/272585/5789.jpg',
  'BREEZE RESIDENCY': 'https://breezeresidency.com/wp-content/uploads/2023/10/Website-Banner_01.jpg',
  'HOTEL ROCKFORT VIEW': 'https://assets.simplotel.com/simplotel/image/upload/x_0,y_0,w_1280,h_721,r_0,c_crop/q_80,w_900,dpr_1,f_auto,fl_progressive,c_limit/park-elanza/facade-rockfort-view-daytime',
  "EARL'S SECRET": 'https://assets.simplotel.com/simplotel/image/upload/x_0,y_0,w_1650,h_928,r_0,c_crop/q_80,w_900,dpr_1,f_auto,fl_progressive,c_limit/the-littlearth-group/Earl_s_secret_top_banner_webpage-01_ddfpto',
  SHINKOWS: 'https://upload.wikimedia.org/wikipedia/commons/3/34/Shinkows_in_2009.jpg',
  'HYDERABAD BIRYANI HOUSE': 'https://static.where-e.com/India/The_Nilgiris/Udagamandalam/Hyderabad-Biryani-House_5f6a66f2545ae03167ea56921c3f2bdc.jpg',
  ANGAARA: 'https://b.zmtcdn.com/data/pictures/7/18698487/8cd0833c0ed26efcb76c3e66bf70881b.jpeg',
  'CLOUD STREET': 'https://astonishingindia.net/wp-content/uploads/2017/08/cloud-street.png',
  'ASTORIA VEG': 'https://astoriaveg.in/wp-content/uploads/2025/10/2-1.jpg',
  'PASSIFLORA RISTORANTE ITALIANO': 'https://media-cdn.tripadvisor.com/media/photo-o/11/13/4a/da/come2poombarai.jpg',
  "ALTAF'S CAFE": 'https://youthopia.in/wp-content/uploads/2014/07/Kodai-Vatta-Altaf-s-Cafe1.jpg',
  'MARRY BROWN FAMILY RESTAURANT': 'https://img02.restaurantguru.com/cb14-Marrybrown-Family-Restaurant-Thanjavur-interior.jpg',
  SATHARS: 'https://img02.restaurantguru.com/ced9-Sathars-Restaurant-meals-1.jpg',
  'VASANTHA BHAVAN': 'https://img02.restaurantguru.com/c94f-Vasantha-Bhavan-Restaurant-Thanjavur-interior.jpg',
  'FAMOUS FRESH FISH FRY': 'https://img02.restaurantguru.com/c950-Restaurant-Famous-Fresh-Fish-Fry-seafood.jpg',
  'KUMARI FRESH SEAFOODS': 'https://media.evendo.com/locations-resized/RestaurantImages/1920x466/5d26ecdc-f871-4ae0-b4c7-073e90efad23.72922%26pitch%3D0%26thumbfov%3D100',
  'ANJAPPAR CHETTINAD': 'https://b.zmtcdn.com/data/reviews_photos/1e5/89d2a7706dd5cbe662214aca107941e5_1611388271.jpg',
};

function serialize(arr) {
  return `'use strict';\n\nmodule.exports = ${JSON.stringify(arr, null, 2)};\n`;
}

function applyToFile(filePath) {
  const records = require(filePath);
  let updated = 0;
  for (const rec of records) {
    const url = imageMap[rec.name];
    if (url) {
      rec.imageUrl = url;
      updated++;
    }
  }
  const out = serialize(records);
  fs.writeFileSync(filePath, out, 'utf8');
  console.log(`[update-images] ${path.basename(filePath)}: ${updated} imageUrl entries written`);
  return records;
}

const part1 = applyToFile(path.join(__dirname, 'data', 'hotels-part1.js'));
const part2 = applyToFile(path.join(__dirname, 'data', 'hotels-part2.js'));
const all = part1.concat(part2);

const withImg = all.filter((r) => r.imageUrl);
const without = all.filter((r) => !r.imageUrl);
console.log(`[update-images] with image: ${withImg.length} | without: ${without.length}`);
console.log('[update-images] no image:', without.map((r) => r.name).join(', '));