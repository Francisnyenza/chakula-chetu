/* ============================================================
   Chakula Chetu — Tanzanian meal suggester.
   Breakfast / Lunch / Dinner + day plan + weekly menu + shopping list.
   Plans are LOCKED once made: they only change when the cook asks.

   You need an account. Everything is kept on the device so the app
   works with no network, and synced to the server so the same
   kitchen opens on any phone or laptop. See api.js.
   ============================================================ */

const $=id=>document.getElementById(id);
const pick=a=>a[Math.floor(Math.random()*a.length)];
/* load() hands back the live document; save() persists and syncs it. */
function load(){ return CC.doc(); }
function save(){ CC.commit(); }

let lang=load().lang||'en';
function t(en,sw){ return lang==='sw'?sw:en; }
function applyLang(){
  document.querySelectorAll('[data-en]').forEach(el=>{ el.textContent=lang==='sw'?el.dataset.sw:el.dataset.en; });
  $('langLabel').textContent=lang==='sw'?'English':'Kiswahili';
}
$('langToggle').onclick=()=>{
  lang=lang==='sw'?'en':'sw'; const d=load(); d.lang=lang; save(d);
  applyLang(); renderFilters(); setAuthMode(authMode);
  if(isLoggedIn()){ refreshHome(); show('home'); } else { show('auth'); }
};

/* ---------- FILTERS ---------- */
const FILTER_DEFS=[
  {key:'veg',     en:'Vegetarian', sw:'Mboga tu'},
  {key:'budget',  en:'Budget',     sw:'Nafuu'},
  {key:'quick',   en:'Quick',      sw:'Haraka'},
  {key:'fish',    en:'Fish',       sw:'Samaki'},
  {key:'chicken', en:'Chicken',    sw:'Kuku'},
  {key:'meat',    en:'Meat',       sw:'Nyama'},
];
let filters={};
FILTER_DEFS.forEach(f=>filters[f.key]=false);
let budget={amount:0, people:4};
/* Read the account's settings into the live variables. Runs at start-up and
   again whenever a sync brings newer settings down from another device. */
function hydrateSettings(){
  const d=load();
  FILTER_DEFS.forEach(f=>{ filters[f.key] = !!(d.filters && d.filters[f.key]); });
  budget = d.budget ? {amount:+d.budget.amount||0, people:+d.budget.people||4} : {amount:0, people:4};
  lang = d.lang==='sw' ? 'sw' : 'en';
}
function persistSettings(){ const d=load(); d.filters=filters; d.budget=budget; save(d); }

/* ---------- DATA: Tanzanian dishes ----------
   tags: veg, budget, quick, hearty, fish, chicken, meat
   cost = rough TSh per person                                   */
const BREAKFAST=[
  {sw:'Chai na mkate', en:'Tea with bread (butter/jam)', tags:['veg','budget','quick'], cost:1000, shop:'mkate, chai, sukari, maziwa, siagi'},
  {sw:'Chapati', en:'Soft flatbread', tags:['veg','budget'], cost:1000, shop:'unga wa ngano, mafuta, chumvi'},
  {sw:'Maandazi', en:'Fried sweet dough (donuts)', tags:['veg','budget'], cost:900, shop:'unga, sukari, hamira, nazi'},
  {sw:'Uji wa ulezi', en:'Millet porridge', tags:['veg','budget','quick'], cost:700, shop:'unga wa ulezi, sukari, maziwa'},
  {sw:'Vitumbua', en:'Rice-coconut rice cakes', tags:['veg','budget'], cost:1000, shop:'unga wa mchele, nazi, sukari, hamira'},
  {sw:'Mayai na mkate', en:'Eggs with bread', tags:['quick'], cost:2000, shop:'mayai, mkate, vitunguu, nyanya'},
  {sw:'Viazi vitamu vya kuchemsha', en:'Boiled sweet potatoes', tags:['veg','budget','quick'], cost:800, shop:'viazi vitamu'},
  {sw:'Maharage na chapati', en:'Beans with chapati', tags:['veg','hearty'], cost:1800, shop:'maharage, vitunguu, nyanya, unga wa ngano'},
  {sw:'Maini na chapati', en:'Fried liver with chapati', tags:['hearty','meat'], cost:3000, shop:'maini, unga wa ngano, vitunguu, nyanya'},
  {sw:'Saladi ya matunda', en:'Fruit salad', tags:['veg','quick'], cost:1500, shop:'matunda mchanganyiko, ndimu, mtindi'},
  {sw:'Mkate wa kumimina', en:'Steamed rice bread', tags:['veg','budget'], cost:1200, shop:'unga wa mchele, nazi, sukari'},
];
const MAINS=[ // lunch & dinner mains
  {sw:'Wali na maharage', en:'Rice with beans', tags:['veg','budget','hearty'], cost:2000, shop:'mchele, maharage, nyanya, vitunguu'},
  {sw:'Ugali na mchicha', en:'Ugali with spinach', tags:['veg','budget'], cost:1500, shop:'unga wa mahindi, mchicha, nyanya, vitunguu'},
  {sw:'Ugali na samaki', en:'Ugali with fish', tags:['hearty','fish'], cost:4000, shop:'unga wa mahindi, samaki, nyanya, ndimu'},
  {sw:'Pilau', en:'Spiced rice (with meat)', tags:['hearty','meat'], cost:5000, shop:'mchele, nyama, viungo vya pilau, vitunguu'},
  {sw:'Wali na maini', en:'Rice with fried liver', tags:['hearty','meat'], cost:4000, shop:'mchele, maini, vitunguu, nyanya, pilipili'},
  {sw:'Ugali na maini', en:'Ugali with fried liver', tags:['hearty','meat'], cost:3500, shop:'unga wa mahindi, maini, vitunguu, nyanya'},
  {sw:'Maini ya kukaanga na chapati', en:'Fried liver with chapati', tags:['hearty','meat'], cost:4000, shop:'maini, unga wa ngano, vitunguu, pilipili, ndimu'},
  {sw:'Wali wa nazi na maharage', en:'Coconut rice with beans', tags:['veg','hearty'], cost:2500, shop:'mchele, nazi, maharage'},
  {sw:'Ndizi nyama', en:'Plantain & meat stew', tags:['hearty','meat'], cost:4500, shop:'ndizi, nyama, nyanya, vitunguu'},
  {sw:'Makande', en:'Maize & beans stew', tags:['veg','budget','hearty'], cost:1800, shop:'mahindi, maharage, nazi'},
  {sw:'Wali na kuku', en:'Rice with chicken stew', tags:['hearty','chicken'], cost:5000, shop:'mchele, kuku, nyanya, viungo'},
  {sw:'Ugali na nyama', en:'Ugali with meat stew', tags:['hearty','meat'], cost:4500, shop:'unga wa mahindi, nyama, nyanya'},
  {sw:'Chapati na mchuzi wa kuku', en:'Chapati with chicken curry', tags:['hearty','chicken'], cost:5000, shop:'unga wa ngano, kuku, nyanya, viungo'},
  {sw:'Wali na dagaa', en:'Rice with small dried fish', tags:['budget','hearty','fish'], cost:2500, shop:'mchele, dagaa, nyanya, vitunguu'},
  {sw:'Ugali na kisamvu', en:'Ugali with cassava leaves', tags:['veg','budget'], cost:1800, shop:'unga wa mahindi, kisamvu, nazi, karanga'},
  {sw:'Mtori', en:'Banana & meat soup', tags:['hearty','meat'], cost:4000, shop:'ndizi, nyama, nyanya, vitunguu'},
  {sw:'Wali na mboga za majani', en:'Rice with leafy greens', tags:['veg','budget'], cost:1800, shop:'mchele, mboga za majani, nyanya'},
  {sw:'Wali na njegere', en:'Rice with green peas', tags:['veg','hearty'], cost:2200, shop:'mchele, njegere, vitunguu, nyanya'},
  {sw:'Tambi za nyama', en:'Savoury vermicelli with meat', tags:['hearty','meat'], cost:4000, shop:'tambi, nyama, vitunguu, nyanya'},
  {sw:'Mihogo na nyama', en:'Cassava with meat stew', tags:['hearty','meat'], cost:4000, shop:'mihogo, nyama, vitunguu, nyanya'},
  {sw:'Magimbi ya nazi', en:'Taro in coconut sauce', tags:['veg','hearty'], cost:2500, shop:'magimbi, nazi, vitunguu'},
  {sw:'Samaki wa kupaka', en:'Grilled fish in coconut sauce', tags:['hearty','fish'], cost:5500, shop:'samaki, nazi, ndimu, viungo'},
  {sw:'Kuku wa kuchoma na kachumbari', en:'Grilled chicken with salad', tags:['hearty','chicken'], cost:6000, shop:'kuku, ndimu, vitunguu, nyanya, pilipili'},
  {sw:'Mchuzi wa uyoga na wali', en:'Mushroom stew with rice', tags:['veg','hearty'], rare:true, cost:3000, shop:'uyoga, mchele, vitunguu, nyanya'},
];
const SIDES=[
  {sw:'Kachumbari', en:'Tomato & onion salad', tags:['veg','quick'], cost:500, shop:'nyanya, vitunguu, ndimu'},
  {sw:'Mchicha', en:'Cooked spinach', tags:['veg'], cost:600, shop:'mchicha, vitunguu, nyanya'},
  {sw:'Kisamvu', en:'Cassava leaves in coconut', tags:['veg'], cost:700, shop:'kisamvu, nazi, karanga'},
  {sw:'Parachichi', en:'Sliced avocado', tags:['veg','quick'], cost:800, shop:'parachichi'},
  {sw:'Saladi ya majani', en:'Green salad', tags:['veg','quick'], cost:700, shop:'saladi, nyanya, tango'},
  {sw:'Maharage ya nazi', en:'Beans in coconut sauce', tags:['veg'], cost:900, shop:'maharage, nazi'},
  {sw:'Mboga za kukaanga', en:'Stir-fried vegetables', tags:['veg','quick'], cost:800, shop:'mboga mchanganyiko, vitunguu, mafuta'},
];

/* ---------- FRUITS available locally + juices made from them ---------- */
const FRUITS=[
  {sw:'Embe', en:'Mango', eat:true},
  {sw:'Machungwa', en:'Orange', eat:true},
  {sw:'Papai', en:'Papaya', eat:true},
  {sw:'Tikiti maji', en:'Watermelon', eat:true},
  {sw:'Parachichi', en:'Avocado', eat:true},
  {sw:'Ndizi', en:'Banana', eat:true},
  {sw:'Nanasi', en:'Pineapple', eat:true},
  {sw:'Pera', en:'Guava', eat:true},
  {sw:'Zabibu', en:'Grapes', eat:true},
  {sw:'Passion', en:'Passion fruit', eat:true},
  {sw:'Ndimu', en:'Lemon/lime', eat:false},
  {sw:'Ukwaju', en:'Tamarind', eat:false},
  {sw:'Rozela', en:'Roselle (hibiscus)', eat:false},
  {sw:'Beetroot', en:'Beetroot', eat:false},
];
const FRUIT_COST=700, JUICE_COST=800;

/* ============================================================
   MY FOODS — dishes, juices, fruit and mboga the cook adds,
   with the meals they belong to and how often they should appear.
   Stored per account, exactly like favourites and plans.
   ============================================================ */
const KINDS=[
  {key:'main',  en:'Main dish',  sw:'Chakula kikuu'},
  {key:'side',  en:'Mboga / side',sw:'Mboga / kiambatanisho'},
  {key:'fruit', en:'Fruit',      sw:'Tunda'},
  {key:'juice', en:'Juice / drink',sw:'Juisi / kinywaji'},
];
const PERIODS=[
  {key:'day',   en:'per day',   sw:'kwa siku'},
  {key:'week',  en:'per week',  sw:'kwa wiki'},
  {key:'month', en:'per month', sw:'kwa mwezi'},
];
const DEFAULT_COST={main:3000, side:800, fruit:FRUIT_COST, juice:JUICE_COST};

/* everything below belongs to the logged-in account — nothing is stored device-wide */
function myOf(d){ const u=currentUser(d); return u?(u.myFoods=u.myFoods||[]):[]; }
function myFoods(){ return myOf(load()); }
function saveMyFoods(arr){ const d=load(); const u=currentUser(d);
  if(!u) return; u.myFoods=arr; save(d); }
function myFoodsOf(kind){ return myFoods().filter(f=>f.kind===kind); }
/* foods with a frequency are placed deliberately; n=0 means "whenever" so they
   simply join the normal pool */
function myPlanned(kind){ return myFoodsOf(kind).filter(f=>+f.n>0); }
function myAnytime(kind){ return myFoodsOf(kind).filter(f=>!(+f.n>0)); }
function mealsOf(f){ return (f.meals&&f.meals.length)?f.meals:['breakfast','lunch','dinner']; }
/* a custom food dressed as a normal dish object so the rest of the app can use it */
function asDish(f){
  return {sw:f.sw, en:f.en||f.sw, tags:f.veg?['veg']:[], cost:+f.cost||DEFAULT_COST[f.kind]||0,
          shop:f.shop||f.sw.toLowerCase(), steps:f.steps||[], video:f.video||'',
          custom:true, kind:f.kind};
}
function customDishes(kind, meal, plannedToo){
  const src = plannedToo ? myFoodsOf(kind) : myAnytime(kind);
  return src.filter(f=>!meal || mealsOf(f).includes(meal)).map(asDish);
}
/* how many times a food should appear in one week / one day */
function weeklyQuota(f){
  const n=+f.n||0;
  if(f.per==='day')  return n*7;
  if(f.per==='week') return n;
  return n/4.3;                       // per month
}
function dailyQuota(f){
  const n=+f.n||0;
  if(f.per==='day')  return n;
  if(f.per==='week') return n/7;
  return n/30;                        // per month
}
/* 2.4 becomes 2 most of the time and 3 sometimes, so "5 per month" stays honest */
function resolveQuota(q){ const b=Math.floor(q); return b + (Math.random() < (q-b) ? 1 : 0); }
function shuffleArr(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function pickFruit(){ return pick([...FRUITS.filter(f=>f.eat), ...myAnytime('fruit')]); }
function pickJuice(){
  const custom=myAnytime('juice');
  const pool=[...FRUITS.map(f=>f.sw), ...custom.map(f=>f.sw)];
  return juiceOf(pick(pool));
}
function juiceOf(key){
  const c=myFoodsOf('juice').find(f=>f.sw===key);
  if(c) return {sw:c.sw, en:c.en||c.sw, fruitSw:c.sw, custom:true, video:c.video||''};
  const f=FRUITS.find(x=>x.sw===key)||FRUITS[0];
  return {sw:'Juisi ya '+f.sw, en:f.en+' juice', fruitSw:f.sw};
}
function fruitBySw(sw){
  return myFoodsOf('fruit').find(f=>f.sw===sw) || myFoodsOf('juice').find(f=>f.sw===sw)
      || FRUITS.find(f=>f.sw===sw) || FRUITS[0];
}
function shopTerm(o){ return (o.shop||o.sw||'').toLowerCase(); }
/* custom fruit/juice carry their own price; built-in ones use the flat rate */
function costOfExtra(sw, fallback){ const c=fruitBySw(sw); return c.kind ? (+c.cost||fallback) : fallback; }

/* ---------- RECIPES: how to prepare each dish (steps), keyed by Swahili name ---------- */
const RECIPES={
  'Chai na mkate':{sw:['Chemsha maji, weka majani ya chai (au tea bag) na sukari.','Ongeza maziwa, acha yachemke kidogo.','Chuja chai kwenye kikombe.','Kata mkate, paka siagi au jam, tumia na chai.'],
    en:['Boil water, add tea leaves (or a tea bag) and sugar.','Add milk and let it simmer briefly.','Strain the tea into a cup.','Slice bread, spread butter or jam, serve with the tea.']},
  'Chapati':{sw:['Changanya unga wa ngano, chumvi, maji kidogo na mafuta; ukande hadi ulainike.','Acha donge lipumzike dakika 20-30.','Gawa vipande, sukuma duara, paka mafuta, kunja na usukume tena.','Kaanga kwenye kikaango cha moto kwa mafuta kidogo hadi pande zote ziwe za kahawia.'],
    en:['Mix wheat flour, salt, a little water and oil; knead until smooth.','Rest the dough 20-30 minutes.','Divide, roll into circles, brush with oil, fold and roll again.','Fry on a hot pan with a little oil until golden on both sides.']},
  'Maandazi':{sw:['Changanya unga, sukari, hamira, hiliki na maziwa/nazi; ukande.','Acha donge liumuke kwa saa moja.','Sukuma na ukate vipande vya pembetatu.','Kaanga kwenye mafuta ya moto hadi yawe ya dhahabu.'],
    en:['Mix flour, sugar, yeast, cardamom and milk/coconut; knead.','Let the dough rise for about one hour.','Roll out and cut into triangles.','Deep-fry in hot oil until golden.']},
  'Uji wa ulezi':{sw:['Koroga unga wa ulezi kwenye maji baridi upate uji laini bila madonge.','Chemsha maji mengine, mimina mchanganyiko ukikoroga.','Pika kwa moto wa wastani dakika 10-15 ukikoroga.','Ongeza sukari, maziwa au nazi na ndimu kidogo.'],
    en:['Mix millet flour into cold water to a smooth lump-free paste.','Boil more water, pour in the paste while stirring.','Cook on medium heat 10-15 min, stirring.','Add sugar, milk or coconut and a little lemon.']},
  'Vitumbua':{sw:['Saga mchele uliolowekwa na nazi upate uji mzito.','Ongeza sukari na hamira, acha uumuke.','Pasha chuma cha vitumbua, mimina mchanganyiko kila kishimo.','Pika hadi chini iwe kahawia, geuza kidogo, toa.'],
    en:['Grind soaked rice with coconut into a thick batter.','Add sugar and yeast, let it rise.','Heat a vitumbua pan, pour batter into each mould.','Cook until the base browns, turn briefly, remove.']},
  'Mayai na mkate':{sw:['Kaanga vitunguu na nyanya kwa mafuta kidogo.','Vunja mayai, koroga na chumvi, mimina.','Pika ukikoroga hadi yaive (au tengeneza omeleti).','Tumia na mkate na chai.'],
    en:['Fry onion and tomato in a little oil.','Beat eggs with salt, pour in.','Stir-cook until set (or make an omelette).','Serve with bread and tea.']},
  'Viazi vitamu vya kuchemsha':{sw:['Osha na menya viazi vitamu, kata vipande.','Weka kwenye sufuria na maji na chumvi kidogo.','Chemsha dakika 15-20 hadi vilainike.','Chuja maji, tumia na chai au nazi.'],
    en:['Wash and peel sweet potatoes, cut into pieces.','Put in a pot with water and a little salt.','Boil 15-20 min until soft.','Drain and serve with tea or coconut.']},
  'Maharage na chapati':{sw:['Chemsha maharage hadi yalainike (au tumia ya makopo).','Kaanga vitunguu na nyanya, ongeza maharage na maji kidogo.','Tia chumvi na bizari, acha yachemke yawe mzito.','Tumia na chapati za moto.'],
    en:['Boil beans until soft (or use canned).','Fry onion and tomato, add beans and a little water.','Season with salt and spices, simmer to thicken.','Serve with hot chapati.']},
  'Maini na chapati':{sw:['Osha maini, kata vipande vidogo, paka chumvi na ndimu.','Kaanga vitunguu, ongeza maini, pilipili na bizari.','Pika dakika 8-10 hadi yaive (usiyakaushe sana).','Tumia na chapati za moto.'],
    en:['Wash liver, cut small, season with salt and lemon.','Fry onion, add liver, chilli and spices.','Cook 8-10 min until done (do not overcook or dry it).','Serve with hot chapati.']},
  'Saladi ya matunda':{sw:['Osha na menya matunda (embe, papai, nanasi, ndizi).','Kata vipande vidogo, weka kwenye bakuli.','Kamua ndimu kidogo, ongeza mtindi au asali (hiari).','Changanya taratibu, pakua ikiwa baridi.'],
    en:['Wash and peel the fruit (mango, papaya, pineapple, banana).','Cut into small pieces, put in a bowl.','Squeeze a little lime, add yogurt or honey (optional).','Mix gently, serve chilled.']},
  'Mkate wa kumimina':{sw:['Saga mchele uliolowekwa na nazi upate uji mzito.','Ongeza sukari, hamira na hiliki, acha uumuke.','Mimina kwenye chombo chenye mafuta.','Oka hadi uive na juu iwe ya kahawia.'],
    en:['Grind soaked rice with coconut into a thick batter.','Add sugar, yeast and cardamom, let it rise.','Pour into a greased dish.','Bake until cooked and golden on top.']},

  'Wali na maharage':{sw:['Osha mchele, pika kwa maji na chumvi (na mafuta kidogo) hadi uive.','Chemsha maharage hadi yalainike.','Kaanga vitunguu na nyanya, ongeza maharage, tia chumvi, acha mzito.','Pakua wali na mchuzi wa maharage.'],
    en:['Wash rice, cook with water, salt (and a little oil) until done.','Boil beans until soft.','Fry onion and tomato, add beans, season, simmer thick.','Serve rice with the bean stew.']},
  'Ugali na mchicha':{sw:['Chemsha maji, mimina unga wa mahindi taratibu ukikoroga.','Endelea kukoroga na kuongeza unga hadi ugali ushikamane.','Kaanga mchicha na vitunguu, nyanya na chumvi.','Pakua ugali na mchicha.'],
    en:['Boil water, add maize flour slowly while stirring.','Keep stirring and adding flour until the ugali is firm.','Cook spinach with onion, tomato and salt.','Serve ugali with the spinach.']},
  'Ugali na samaki':{sw:['Safisha samaki, paka chumvi na ndimu.','Kaanga au choma samaki hadi aive.','Tengeneza mchuzi wa nyanya na vitunguu, weka samaki ndani.','Andaa ugali, pakua na samaki na mchuzi.'],
    en:['Clean fish, rub with salt and lemon.','Fry or grill the fish until cooked.','Make a tomato-onion sauce, place the fish in it.','Prepare ugali, serve with fish and sauce.']},
  'Pilau':{sw:['Kaanga vitunguu, ongeza nyama na viungo vya pilau (hiliki, mdalasini, karafuu, bizari).','Pika nyama hadi ilainike.','Ongeza mchele uliooshwa na maji ya kupimia.','Funika, pika kwa moto mdogo hadi wali uive.'],
    en:['Fry onion, add meat and pilau spices (cardamom, cinnamon, cloves, cumin).','Cook the meat until tender.','Add washed rice and measured water.','Cover and cook on low heat until the rice is done.']},
  'Wali na maini':{sw:['Pika wali kwa kawaida hadi uive.','Osha maini, kata vipande, kaanga na vitunguu.','Ongeza nyanya, chumvi, pilipili na bizari; pika dakika 8-10.','Pakua wali na maini.'],
    en:['Cook plain rice until done.','Wash liver, cut up, fry with onion.','Add tomato, salt, chilli and spices; cook 8-10 min.','Serve rice with the liver.']},
  'Ugali na maini':{sw:['Andaa ugali kutoka unga wa mahindi.','Kaanga maini na vitunguu, nyanya, chumvi na pilipili.','Pika hadi maini yaive lakini yasikauke.','Pakua ugali na maini.'],
    en:['Prepare ugali from maize flour.','Fry liver with onion, tomato, salt and chilli.','Cook until the liver is done but not dry.','Serve ugali with the liver.']},
  'Maini ya kukaanga na chapati':{sw:['Osha maini, kata vipande vidogo, paka chumvi na ndimu.','Kaanga vitunguu, ongeza maini, pilipili na bizari.','Kaanga dakika 8-10 hadi yaive.','Tumia na chapati za moto.'],
    en:['Wash liver, cut small, season with salt and lemon.','Fry onion, add liver, chilli and spices.','Stir-fry 8-10 min until cooked.','Serve with hot chapati.']},
  'Wali wa nazi na maharage':{sw:['Pika mchele kwa maziwa ya nazi badala ya maji.','Chemsha maharage hadi yalainike.','Tengeneza mchuzi wa maharage kwa nazi, vitunguu na nyanya.','Pakua wali wa nazi na maharage.'],
    en:['Cook rice in coconut milk instead of water.','Boil beans until soft.','Make a bean stew with coconut, onion and tomato.','Serve coconut rice with the beans.']},
  'Ndizi nyama':{sw:['Kaanga vitunguu na nyama hadi nyama ianze kulainika.','Ongeza nyanya, chumvi na maji kidogo.','Menya ndizi, kata, weka kwenye mchuzi.','Pika hadi ndizi na nyama ziive.'],
    en:['Fry onion and meat until the meat starts to soften.','Add tomato, salt and a little water.','Peel bananas, cut, add to the stew.','Cook until bananas and meat are done.']},
  'Makande':{sw:['Loweka mahindi na maharage usiku kucha.','Chemsha pamoja saa 1-2 hadi vilainike.','Ongeza maziwa ya nazi na chumvi.','Pika kidogo zaidi hadi mzito, pakua.'],
    en:['Soak maize and beans overnight.','Boil together 1-2 hrs until soft.','Add coconut milk and salt.','Simmer a bit more until thick, serve.']},
  'Wali na kuku':{sw:['Pika wali hadi uive.','Kaanga vitunguu, ongeza kuku, chumvi na viungo.','Ongeza nyanya na maji, pika hadi kuku aive na mchuzi uwe mzito.','Pakua wali na kuku.'],
    en:['Cook rice until done.','Fry onion, add chicken, salt and spices.','Add tomato and water, cook until chicken is done and the sauce thickens.','Serve rice with the chicken.']},
  'Ugali na nyama':{sw:['Kaanga vitunguu, ongeza nyama, chumvi na viungo.','Ongeza nyanya na maji, pika hadi nyama ilainike.','Andaa ugali kutoka unga wa mahindi.','Pakua ugali na nyama.'],
    en:['Fry onion, add meat, salt and spices.','Add tomato and water, cook until the meat is tender.','Prepare ugali from maize flour.','Serve ugali with the meat.']},
  'Chapati na mchuzi wa kuku':{sw:['Andaa chapati (kande, sukuma, kaanga).','Kaanga vitunguu na kuku, ongeza nyanya na viungo.','Ongeza maji, pika hadi kuku aive na mchuzi uwe mzito.','Tumia chapati na mchuzi wa kuku.'],
    en:['Make chapati (knead, roll, fry).','Fry onion and chicken, add tomato and spices.','Add water, cook until chicken is done and the sauce thickens.','Serve chapati with the chicken curry.']},
  'Wali na dagaa':{sw:['Osha dagaa vizuri, ondoa uchafu.','Kaanga vitunguu na nyanya, ongeza dagaa na chumvi.','Pika dakika 10 hadi dagaa ziive.','Pakua na wali.'],
    en:['Wash the small dried fish well.','Fry onion and tomato, add the dagaa and salt.','Cook 10 min until done.','Serve with rice.']},
  'Ugali na kisamvu':{sw:['Twanga/saga kisamvu, chemsha hadi kilainike.','Ongeza nazi, karanga zilizosagwa, vitunguu na chumvi.','Pika hadi kiive na kiwe kizito.','Pakua na ugali.'],
    en:['Pound/grind the cassava leaves, boil until soft.','Add coconut, ground peanuts, onion and salt.','Cook until done and thick.','Serve with ugali.']},
  'Mtori':{sw:['Chemsha nyama na vitunguu hadi ilainike.','Menya ndizi, kata, weka kwenye nyama.','Pika hadi ndizi ziive, kisha ponda kidogo zichanganyike.','Koroga, ongeza chumvi, pakua moto.'],
    en:['Boil meat with onion until tender.','Peel bananas, cut, add to the meat.','Cook until bananas are soft, then mash a little to blend.','Stir, add salt, serve hot.']},
  'Wali na mboga za majani':{sw:['Pika wali hadi uive.','Kaanga mboga za majani na vitunguu na nyanya.','Tia chumvi na mafuta kidogo, pika hadi ziive.','Pakua wali na mboga.'],
    en:['Cook rice until done.','Fry the leafy greens with onion and tomato.','Add salt and a little oil, cook until done.','Serve rice with the greens.']},
  'Wali na njegere':{sw:['Pika wali kwa kawaida hadi uive.','Chemsha njegere hadi zilainike.','Kaanga vitunguu na nyanya, ongeza njegere na chumvi.','Pakua wali na njegere.'],
    en:['Cook plain rice until done.','Boil peas until tender.','Fry onion and tomato, add peas and salt.','Serve rice with the peas.']},
  'Tambi za nyama':{sw:['Kaanga vitunguu na nyama hadi iive.','Ongeza nyanya, chumvi na maji kidogo.','Weka tambi, funika, pika hadi zilainike.','Koroga taratibu, pakua moto.'],
    en:['Fry onion and meat until cooked.','Add tomato, salt and a little water.','Add the vermicelli, cover, cook until soft.','Stir gently, serve hot.']},
  'Mihogo na nyama':{sw:['Menya mihogo, kata vipande, chemsha hadi ilainike.','Tengeneza mchuzi wa nyama na vitunguu na nyanya.','Weka mihogo kwenye mchuzi, pika kidogo.','Pakua mihogo na nyama.'],
    en:['Peel cassava, cut into pieces, boil until soft.','Make a meat stew with onion and tomato.','Add cassava to the stew, simmer briefly.','Serve cassava with the meat.']},
  'Magimbi ya nazi':{sw:['Menya magimbi, kata vipande.','Chemsha hadi yaanze kulainika.','Ongeza maziwa ya nazi, chumvi na vitunguu.','Pika hadi yaive na mchuzi uwe mzito.'],
    en:['Peel taro, cut into pieces.','Boil until it starts to soften.','Add coconut milk, salt and onion.','Cook until done and the sauce thickens.']},
  'Samaki wa kupaka':{sw:['Safisha samaki, paka chumvi, ndimu na viungo; acha dakika 20.','Choma samaki kidogo kwenye moto au kaanga.','Tengeneza mchuzi mzito wa nazi na viungo.','Paka samaki mchuzi wa nazi, pika dakika 10, pakua.'],
    en:['Clean fish, rub with salt, lime and spices; rest 20 min.','Grill or lightly fry the fish.','Make a thick coconut sauce with spices.','Coat the fish in the coconut sauce, cook 10 min, serve.']},
  'Kuku wa kuchoma na kachumbari':{sw:['Osha kuku, kata vipande, paka chumvi, ndimu, kitunguu saumu na pilipili.','Acha akolee dakika 30 au zaidi.','Choma kwenye mkaa au oveni hadi aive na awe wa kahawia.','Tengeneza kachumbari ya nyanya na vitunguu, pakua pamoja.'],
    en:['Wash chicken, cut into pieces, season with salt, lime, garlic and chilli.','Marinate for 30 minutes or more.','Grill over charcoal or bake until cooked and browned.','Make tomato-onion kachumbari and serve together.']},
  'Mchuzi wa uyoga na wali':{sw:['Osha uyoga, kata vipande.','Kaanga vitunguu, ongeza uyoga, nyanya na chumvi.','Pika dakika 10 hadi uyoga uive.','Pakua na wali.'],
    en:['Wash mushrooms, slice them.','Fry onion, add mushrooms, tomato and salt.','Cook 10 min until the mushrooms are done.','Serve with rice.']},

  'Kachumbari':{sw:['Kata nyanya na vitunguu vipande vyembamba.','Ongeza pilipili hoho au pilipili kali (hiari).','Kamua ndimu, tia chumvi kidogo.','Changanya, pakua ikiwa baridi.'],
    en:['Slice tomatoes and onions thinly.','Add sweet or hot pepper (optional).','Squeeze lime and add a little salt.','Toss and serve cool.']},
  'Mchicha':{sw:['Osha mchicha vizuri, kata.','Kaanga vitunguu na nyanya kwa mafuta kidogo.','Weka mchicha, tia chumvi.','Pika dakika 5-8, usiiache ikauke sana.'],
    en:['Wash the spinach well and chop.','Fry onion and tomato in a little oil.','Add the spinach and salt.','Cook 5-8 min, do not overcook.']},
  'Kisamvu':{sw:['Twanga majani ya muhogo.','Chemsha hadi yalainike.','Ongeza nazi na karanga zilizosagwa.','Pika hadi mchuzi uwe mzito.'],
    en:['Pound the cassava leaves.','Boil until soft.','Add coconut milk and ground peanuts.','Cook until thick.']},
  'Parachichi':{sw:['Chagua parachichi lililoiva.','Kata katikati, toa kokwa.','Kata vipande au chota kwa kijiko.','Tia chumvi kidogo au ndimu, pakua.'],
    en:['Pick a ripe avocado.','Cut in half and remove the stone.','Slice or scoop out with a spoon.','Add a little salt or lime and serve.']},
  'Saladi ya majani':{sw:['Osha majani ya saladi, nyanya na tango.','Kata vipande vidogo.','Changanya na ndimu, mafuta kidogo na chumvi.','Pakua ikiwa baridi.'],
    en:['Wash the lettuce, tomato and cucumber.','Cut into small pieces.','Toss with lime, a little oil and salt.','Serve chilled.']},
  'Maharage ya nazi':{sw:['Chemsha maharage hadi yalainike.','Kamua tui la nazi.','Weka tui, chumvi na vitunguu.','Pika hadi mchuzi uwe mzito.'],
    en:['Boil the beans until soft.','Extract coconut milk.','Add coconut milk, salt and onion.','Simmer until the sauce thickens.']},
  'Mboga za kukaanga':{sw:['Kata mboga mchanganyiko vipande vidogo.','Kaanga vitunguu kwa mafuta ya moto.','Weka mboga, koroga kwa moto mkali dakika 5.','Tia chumvi, pakua zikiwa bado na rangi nzuri.'],
    en:['Chop mixed vegetables into small pieces.','Fry onion in hot oil.','Add vegetables and stir-fry on high heat for 5 min.','Season with salt and serve while still colourful.']},
};
/* Only http(s) links are allowed to become buttons — never javascript: */
function safeUrl(u){ const s=String(u||'').trim(); return /^https?:\/\//i.test(s) ? s : ''; }
/* A video for ANY food — the cook's own link if they pasted one, otherwise a
   YouTube search in the language they are reading the app in. Works for a dish
   they saw on social media and have never cooked before. */
function ytLink(name, own){
  const mine=safeUrl(own);
  /* Every caller drops this straight into href="…", so it leaves quote-safe. */
  if(mine) return escHtml(mine);
  const q = lang==='sw' ? 'jinsi ya kupika '+name : 'how to cook '+name+' recipe';
  return 'https://www.youtube.com/results?search_query='+encodeURIComponent(q);
}
function ytOf(o){ return ytLink(o.sw, o.video); }
/* simple steps so juice and fruit also get real instructions, not just a video */
const GENERIC_JUICE={
  sw:['Osha na menya tunda, kata vipande.','Weka kwenye blenda na maji baridi kidogo.','Saga hadi ilainike.','Chuja, ongeza sukari au ndimu kidogo, pakua ikiwa baridi.'],
  en:['Wash and peel the fruit, cut into pieces.','Put in a blender with a little cold water.','Blend until smooth.','Strain, add a little sugar or lime, serve chilled.']};
const GENERIC_FRUIT={
  sw:['Osha tunda kwa maji safi.','Menya au kata kama inavyohitajika.','Kata vipande vya kuliwa.','Pakua likiwa baridi, au weka kwenye saladi ya matunda.'],
  en:['Wash the fruit in clean water.','Peel or trim as needed.','Cut into bite-size pieces.','Serve chilled, or add to a fruit salad.']};
function recipeSteps(dish){
  if(dish.custom && dish.steps && dish.steps.length) return dish.steps;   // the cook's own steps
  const r=RECIPES[dish.sw]; if(r) return lang==='sw'?r.sw:r.en;
  if(dish.kind==='juice' || /^juisi ya /i.test(dish.sw)) return lang==='sw'?GENERIC_JUICE.sw:GENERIC_JUICE.en;
  if(dish.kind==='fruit' || dish.isFruit) return lang==='sw'?GENERIC_FRUIT.sw:GENERIC_FRUIT.en;
  return null;
}
function allDishes(){ return [...BREAKFAST,...MAINS,...SIDES,...myFoods().map(asDish)]; }
function dishBySw(sw){ return allDishes().find(d=>d.sw===sw)||null; }
/* resolve ANY name shown in a menu — dish, side, fruit or juice — so every one
   of them can open the recipe sheet and its video */
function anyBySw(sw){
  const d=dishBySw(sw); if(d) return d;
  const f=FRUITS.find(x=>x.sw===sw);
  if(f) return {sw:f.sw, en:f.en, tags:['veg'], cost:FRUIT_COST, shop:f.sw.toLowerCase(), isFruit:true};
  const m=/^Juisi ya (.+)$/i.exec(sw);
  if(m){
    const src=FRUITS.find(x=>x.sw.toLowerCase()===m[1].toLowerCase());
    return {sw, en:(src?src.en+' juice':'Juice'), tags:['veg'], cost:JUICE_COST,
            shop:(src?src.sw:m[1]).toLowerCase()+', sukari, maji', kind:'juice'};
  }
  return null;
}

/* ---------- money helpers ---------- */
function TSh(n){ return Math.round(n).toLocaleString('en-US')+' TSh'; }
function budgetActive(){ return filters.budget && budget.amount>0; }
/* how much one main dish may cost per person, for the given scope */
function allowanceFor(scope){
  if(!budgetActive()) return 0;
  const people=Math.max(1,budget.people);
  const perPerson=budget.amount/people;
  if(scope==='week'){    // 7 days x 3 meals, each meal also carries a fruit + juice
    return Math.max(500, perPerson/7/3 - (FRUIT_COST+JUICE_COST)/3);
  }
  if(scope==='day'){     // 3 meals in one day
    return Math.max(500, perPerson/3 - (FRUIT_COST+JUICE_COST));
  }
  return Math.max(500, perPerson - (FRUIT_COST+JUICE_COST));  // single meal
}
function affordable(pool, allowance){
  if(!allowance) return pool;
  const ok=pool.filter(d=>d.cost<=allowance*1.1);
  if(ok.length) return ok;
  return [...pool].sort((a,b)=>a.cost-b.cost).slice(0,3);   // cheapest options
}

/* ---------- filtering & selection ---------- */
const PROTEIN_FILTERS=['fish','chicken','meat'];
const SOFT_FILTERS=['quick'];   // a convenience wish — may be relaxed if nothing matches
function activeFilterList(){ return Object.keys(filters).filter(k=>filters[k]); }
function matchesKeys(dish, keys){
  // 'budget' is handled by the money allowance, not as a tag requirement
  const need=keys.filter(f=>f!=='budget');
  const wantProtein=need.filter(f=>PROTEIN_FILTERS.includes(f));
  const others=need.filter(f=>!PROTEIN_FILTERS.includes(f));
  if(!others.every(f=>dish.tags.includes(f))) return false;
  if(wantProtein.length) return wantProtein.some(f=>dish.tags.includes(f)); // any of the chosen proteins
  return true;
}
function matches(dish){ return matchesKeys(dish, activeFilterList()); }
/* Relax only the soft wishes when nothing matches — a diet choice such as
   Vegetarian is never dropped, or we would serve meat to a vegetarian. */
function filteredList(base){
  const keys=activeFilterList();
  const attempts=[keys, keys.filter(k=>!SOFT_FILTERS.includes(k))];
  for(const set of attempts){
    const ok=base.filter(d=>matchesKeys(d,set));
    if(ok.length) return ok;
  }
  return base;
}
function poolFor(meal, scope){
  const base = meal==='breakfast' ? BREAKFAST : MAINS;
  // the cook's own dishes for this meal: "whenever" ones always, and the ones with a
  // set frequency too when this is a single browse (plans place those deliberately)
  const mine = customDishes('main', meal, scope==='meal');
  const list = filteredList([...base, ...mine]);
  let ok = list.filter(d=> !d.rare || Math.random()<0.15);
  if(!ok.length) ok = list;
  return affordable(ok, allowanceFor(scope||'meal'));
}
function sidePool(meal, plannedToo){ return filteredList([...SIDES, ...customDishes('side', meal, plannedToo)]); }
function chooseAvoiding(pool, key){
  const d=load(); const recent=(d.recent&&d.recent[key])||[];
  const fresh=pool.filter(x=>!recent.includes(x.sw));
  const chosen=pick(fresh.length?fresh:pool);
  d.recent=d.recent||{}; const list=[chosen.sw,...recent].slice(0,3); d.recent[key]=list; save(d);
  return chosen;
}
function chooseMain(meal, scope){ return chooseAvoiding(poolFor(meal,scope), meal); }
/* Dish names can be typed by the cook, so both of these are escaped: their
   output always goes into innerHTML, never into textContent. */
function nm(o){ return escHtml(lang==='sw'?o.sw:o.en); }
function sub(o){ return escHtml(lang==='sw'?o.en:o.sw); }

const MEALINFO={
  breakfast:{en:'Breakfast', sw:'Kifungua kinywa'},
  lunch:{en:'Lunch', sw:'Chakula cha mchana'},
  dinner:{en:'Dinner', sw:'Chakula cha usiku'},
};
const TAGLABEL=()=>({veg:t('Vegetarian','Mboga tu'),budget:t('Budget','Nafuu'),quick:t('Quick','Haraka'),
  hearty:t('Filling','Inashibisha'),fish:t('Fish','Samaki'),chicken:t('Chicken','Kuku'),meat:t('Meat','Nyama')});

/* ---------- saved plans (LOCKED until the cook asks for a new one) ---------- */
function plansOf(d){ const u=currentUser(d); return u?(u.plans=u.plans||{}):{}; }
function getPlan(type){ return plansOf(load())[type]||null; }
function storePlan(type,plan){ const d=load(); plansOf(d)[type]=plan; save(d); }
function planDate(ts){ return new Date(ts).toLocaleDateString(lang==='sw'?'sw-TZ':'en-GB',{day:'numeric',month:'short'}); }

function buildWeekPlan(){
  function series(meal){
    const p=poolFor(meal,'week').slice(); const out=[];
    for(let i=0;i<7;i++){ if(!p.length) p.push(...poolFor(meal,'week')); out.push(p.splice(Math.floor(Math.random()*p.length),1)[0]); }
    return out;
  }
  const wb=series('breakfast'), wl=series('lunch'), wd=series('dinner');
  // don't serve the same dish for lunch and dinner on one day — swap it with another day
  for(let i=0;i<7;i++){
    if(wd[i].sw!==wl[i].sw) continue;
    const j=wd.findIndex((x,k)=>k!==i && x.sw!==wl[i].sw && wl[k].sw!==wd[i].sw);
    if(j>-1){ const tmp=wd[i]; wd[i]=wd[j]; wd[j]=tmp; }
  }
  const slots={breakfast:wb, lunch:wl, dinner:wd};
  const taken={breakfast:new Set(), lunch:new Set(), dinner:new Set()};
  // honour every "my food" that asked for a set number of times this week
  myPlanned('main').forEach(f=>{
    const meals=mealsOf(f);
    let times=Math.min(resolveQuota(weeklyQuota(f)), meals.length*7);
    const cands=[];
    meals.forEach(m=>{ for(let i=0;i<7;i++) if(!taken[m].has(i)) cands.push([m,i]); });
    shuffleArr(cands);
    for(const [m,i] of cands){ if(times<=0) break; slots[m][i]=asDish(f); taken[m].add(i); times--; }
  });
  // fruit, juice and mboga for each of the 7 days
  const fruits=[], juices=[], sides=new Array(7).fill(null);
  for(let i=0;i<7;i++){ fruits.push(pickFruit().sw); juices.push(pickJuice().fruitSw); }
  plantSimple(fruits,'fruit'); plantSimple(juices,'juice');
  myPlanned('side').forEach(f=>{
    let times=Math.min(resolveQuota(weeklyQuota(f)), 7);
    const idx=shuffleArr([...Array(7).keys()].filter(i=>!sides[i]));
    for(const i of idx){ if(times<=0) break; sides[i]=f.sw; times--; }
  });
  const days=[];
  for(let i=0;i<7;i++){
    days.push({b:wb[i].sw, l:wl[i].sw, d:wd[i].sw, fruit:fruits[i], juice:juices[i], side:sides[i]});
  }
  return {createdAt:Date.now(), people:budget.people, budget:budgetActive()?budget.amount:0,
          filters:activeFilterList(), days, checked:{}};
}
/* place the cook's fruit/juice choices across the 7 days of a week */
function plantSimple(arr, kind){
  const taken=new Set();
  myPlanned(kind).forEach(f=>{
    let times=Math.min(resolveQuota(weeklyQuota(f)), 7);
    const idx=shuffleArr([...Array(7).keys()].filter(i=>!taken.has(i)));
    for(const i of idx){ if(times<=0) break; arr[i]=f.sw; taken.add(i); times--; }
  });
  return arr;
}
function buildDayPlan(){
  const meals={};
  ['breakfast','lunch','dinner'].forEach(m=>{
    const main=chooseMain(m,'day');
    const side = m==='breakfast'? null : pick(sidePool(m,false));
    const fr=pickFruit(), jc=pickJuice();
    meals[m]={main:main.sw, side:side?side.sw:null, fruit:fr.sw, juice:jc.fruitSw};
  });
  // honour "my foods" asked for today
  const usedMain=new Set(), usedSide=new Set(), usedFruit=new Set(), usedJuice=new Set();
  const all=['breakfast','lunch','dinner'];
  myPlanned('main').forEach(f=>{
    const allowed=shuffleArr(mealsOf(f).filter(m=>!usedMain.has(m)));
    let times=Math.min(resolveQuota(dailyQuota(f)), allowed.length);
    for(const m of allowed){ if(times<=0) break; meals[m].main=f.sw; usedMain.add(m); times--; }
  });
  myPlanned('side').forEach(f=>{
    const allowed=shuffleArr(mealsOf(f).filter(m=>m!=='breakfast' && !usedSide.has(m)));
    let times=Math.min(resolveQuota(dailyQuota(f)), allowed.length);
    for(const m of allowed){ if(times<=0) break; meals[m].side=f.sw; usedSide.add(m); times--; }
  });
  myPlanned('fruit').forEach(f=>{
    const allowed=shuffleArr(mealsOf(f).filter(m=>!usedFruit.has(m)));
    let times=Math.min(resolveQuota(dailyQuota(f)), allowed.length);
    for(const m of allowed){ if(times<=0) break; meals[m].fruit=f.sw; usedFruit.add(m); times--; }
  });
  myPlanned('juice').forEach(f=>{
    const allowed=shuffleArr(mealsOf(f).filter(m=>!usedJuice.has(m)));
    let times=Math.min(resolveQuota(dailyQuota(f)), allowed.length);
    for(const m of allowed){ if(times<=0) break; meals[m].juice=f.sw; usedJuice.add(m); times--; }
  });
  return {createdAt:Date.now(), people:budget.people, budget:budgetActive()?budget.amount:0,
          filters:activeFilterList(), meals, checked:{}};
}

/* ---------- cost of a plan ---------- */
function planCost(plan,type){
  const people=Math.max(1,plan.people||1);
  let total=0;
  if(type==='week'){
    plan.days.forEach(day=>{
      ['b','l','d'].forEach(k=>{ const dish=dishBySw(day[k]); total += dish?dish.cost:0; });
      if(day.side){ const s=dishBySw(day.side); total += s?s.cost:0; }
      total += costOfExtra(day.fruit,FRUIT_COST) + costOfExtra(day.juice,JUICE_COST);
    });
  } else {
    Object.values(plan.meals).forEach(m=>{
      const dish=dishBySw(m.main); total += dish?dish.cost:0;
      if(m.side){ const s=dishBySw(m.side); total += s?s.cost:0; }
      total += costOfExtra(m.fruit,FRUIT_COST) + costOfExtra(m.juice,JUICE_COST);
    });
  }
  return total*people;
}

/* ---------- shopping list ---------- */
const SHOP_CATS=[
  {en:'Grains & flour', sw:'Nafaka na unga', words:['mchele','unga','mkate','tambi','mahindi','hamira','ulezi','ngano','chapati']},
  {en:'Meat, fish & eggs', sw:'Nyama, samaki na mayai', words:['nyama','kuku','samaki','dagaa','maini','mayai']},
  {en:'Vegetables & roots', sw:'Mboga na mizizi', words:['vitunguu','nyanya','mchicha','kisamvu','mboga','njegere','maharage','viazi','mihogo','magimbi','uyoga','pilipili','saladi','karanga','tango']},
  {en:'Fruit', sw:'Matunda', words:['matunda','embe','machungwa','papai','tikiti','parachichi','ndizi','nanasi','pera','zabibu','passion','ndimu','ukwaju','rozela','beetroot']},
  {en:'Other', sw:'Vingine', words:[]},
];
function catOf(item){
  const s=item.toLowerCase();
  for(let i=0;i<SHOP_CATS.length-1;i++){
    if(SHOP_CATS[i].words.some(w=>s.includes(w))) return i;
  }
  return SHOP_CATS.length-1;
}
function addItems(map, shopStr){
  if(!shopStr) return;
  shopStr.split(',').map(s=>s.trim()).filter(Boolean).forEach(item=>{
    const key=item.toLowerCase();
    map[key]=(map[key]||0)+1;
  });
}
function shoppingFrom(plan,type){
  const map={};
  if(type==='week'){
    plan.days.forEach(day=>{
      ['b','l','d'].forEach(k=>{ const dish=dishBySw(day[k]); if(dish) addItems(map,dish.shop); });
      if(day.side){ const s=dishBySw(day.side); if(s) addItems(map,s.shop); }
      addItems(map, shopTerm(fruitBySw(day.fruit)));
      addItems(map, shopTerm(fruitBySw(day.juice)));
    });
  } else {
    Object.values(plan.meals).forEach(m=>{
      const dish=dishBySw(m.main); if(dish) addItems(map,dish.shop);
      if(m.side){ const s=dishBySw(m.side); if(s) addItems(map,s.shop); }
      addItems(map, shopTerm(fruitBySw(m.fruit)));
      addItems(map, shopTerm(fruitBySw(m.juice)));
    });
  }
  return map;
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

function renderShopping(into){
  const week=getPlan('week'), day=getPlan('day');
  const plan = week || day;
  const type = week ? 'week' : (day ? 'day' : null);
  let html=`<h2 style="margin-top:0">${t('Shopping list','Orodha ya manunuzi')}</h2>`;
  if(!plan){
    html+=`<p class="muted">${t('Make a weekly menu or a day plan first — then everything you need to buy appears here.','Tengeneza menyu ya wiki au mpango wa siku kwanza — kisha vitu vyote vya kununua vitaonekana hapa.')}</p>
      <div class="row">
        <button class="btn" data-again="week">${t('Make weekly menu','Tengeneza menyu ya wiki')}</button>
        <button class="btn ghost small" data-again="day">${t('Plan a day','Panga siku')}</button>
      </div>
      <div class="row"><button class="btn ghost small" id="bkHome">${t('Home','Nyumbani')}</button></div>`;
    into.innerHTML=html; wireSuggestButtons(into); show(into.id); return;
  }
  const people=Math.max(1,plan.people||1);
  html+=`<p class="muted">${type==='week'
      ? t('For your saved weekly menu','Kwa menyu yako ya wiki iliyohifadhiwa')
      : t('For your saved day plan','Kwa mpango wako wa siku uliohifadhiwa')} · ${t('for','kwa')} <b>${people}</b> ${t(people===1?'person':'people','watu')} · ${planDate(plan.createdAt)}</p>`;

  const map=shoppingFrom(plan,type);
  const groups=SHOP_CATS.map(()=>[]);
  Object.entries(map).sort((a,b)=>b[1]-a[1]).forEach(([item,count])=>{ groups[catOf(item)].push([item,count]); });

  plan.checked=plan.checked||{};
  groups.forEach((items,i)=>{
    if(!items.length) return;
    html+=`<div class="shopcat"><h4>${t(SHOP_CATS[i].en,SHOP_CATS[i].sw)}</h4>`;
    items.forEach(([item,count])=>{
      const done=!!plan.checked[item];
      const id='ck_'+btoa(unescape(encodeURIComponent(item))).replace(/[^A-Za-z0-9]/g,'');
      html+=`<div class="shopitem${done?' done':''}">
        <input type="checkbox" id="${id}" data-buy="${escAttr(item)}" ${done?'checked':''} />
        <label for="${id}">${escHtml(cap(item))}
          <small>${t('needed for','inahitajika kwa')} ${count} ${t(count===1?'meal':'meals','milo')}</small></label>
      </div>`;
    });
    html+=`</div>`;
  });

  const cost=planCost(plan,type);
  html+=`<div class="total"><span>${t('Estimated total','Makadirio ya jumla')}</span><span class="amt">${TSh(cost)}</span></div>`;
  if(plan.budget){
    const left=plan.budget-cost;
    html+= left>=0
      ? `<div class="note lock">${t('Within your budget of','Ndani ya bajeti yako ya')} <b>${TSh(plan.budget)}</b> — ${t('about','takribani')} <b>${TSh(left)}</b> ${t('left over.','zinabaki.')}</div>`
      : `<div class="note over">${t('About','Takribani')} <b>${TSh(-left)}</b> ${t('over your budget of','zaidi ya bajeti yako ya')} <b>${TSh(plan.budget)}</b>. ${t('Turn on Budget and make a new plan for cheaper meals.','Washa Nafuu kisha tengeneza mpango mpya wa vyakula vya bei nafuu.')}</div>`;
  }
  html+=`<div class="note">${t('Prices are rough estimates for Tanzania — markets differ.','Bei ni makadirio ya kawaida ya Tanzania — masoko hutofautiana.')}</div>
    <div class="row">
      <button class="btn ghost small" data-again="${type}">${type==='week'?''+t('See my menu','Ona menyu yangu'):''+t('See my day','Ona siku yangu')}</button>
      <button class="btn ghost small" id="bkHome">${t('Home','Nyumbani')}</button>
    </div>`;
  into.innerHTML=html; wireSuggestButtons(into); show(into.id);

  into.querySelectorAll('[data-buy]').forEach(cb=>cb.onchange=()=>{
    const d=load(); const p=plansOf(d)[type]; if(!p) return;
    p.checked=p.checked||{};
    if(cb.checked) p.checked[cb.dataset.buy]=true; else delete p.checked[cb.dataset.buy];
    save(d);
    cb.closest('.shopitem').classList.toggle('done', cb.checked);
  });
}

/* ---------- recipe sheet (works from anywhere) ---------- */
let lastFocus=null;
function openRecipe(sw){
  const dish=anyBySw(sw); if(!dish) return;
  lastFocus=document.activeElement;
  const steps=recipeSteps(dish);
  const tags=(dish.tags||[]).map(tg=>`<span class="t t-${tg}">${TAGLABEL()[tg]||tg}</span>`).join('');
  $('recipeSheet').innerHTML=`
    <div class="sheetHead">
      <h3 id="rsTitle">${escHtml(dish.sw)}<br><span class="muted" style="font-size:15px; font-weight:400">${escHtml(dish.en||'')}</span></h3>
      <button class="xbtn" id="rsClose" aria-label="${t('Close','Funga')}">×</button>
    </div>
    <div class="tags">${tags}<span class="t t-cost">${TSh(dish.cost)} / ${t('person','mtu')}</span></div>
    <div class="recipe">
      <div><b>${t('Ingredients','Mahitaji')}:</b> ${escHtml(dish.shop||'')}</div>
      ${steps
        ? `<div style="margin-top:10px"><b>${t('How to prepare — step by step','Jinsi ya kuandaa — hatua kwa hatua')}:</b>
             <ol class="rsteps">${steps.map(s=>`<li>${escHtml(s)}</li>`).join('')}</ol></div>`
        : `<div class="note" style="margin-top:10px">${t('You have not written the steps for this one yet — watch the video below and it will show you how to cook it.','Bado hujaandika hatua za chakula hiki — tazama video hapa chini nayo itakuonyesha jinsi ya kupika.')}</div>`}
      <a class="ytbtn" href="${ytOf(dish)}" target="_blank" rel="noopener">${dish.video
        ? t('Watch your saved video','Tazama video yako uliyohifadhi')
        : t('Watch how to cook it on YouTube','Tazama jinsi ya kupika kwenye YouTube')}</a>
    </div>`;
  $('recipeOverlay').classList.remove('hidden');
  $('rsClose').onclick=closeRecipe;
  $('rsClose').focus();
}
function closeRecipe(){
  $('recipeOverlay').classList.add('hidden');
  if(lastFocus && lastFocus.focus) lastFocus.focus();
}
$('recipeOverlay').onclick=e=>{ if(e.target===$('recipeOverlay')) closeRecipe(); };
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !$('recipeOverlay').classList.contains('hidden')) closeRecipe(); });
/* any element with data-recipe-for opens the sheet */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-recipe-for]');
  if(b){ e.preventDefault(); openRecipe(b.dataset.recipeFor); }
});

/* ---------- render one meal ---------- */
function suggestMeal(meal, into){
  const info=MEALINFO[meal];
  const main=chooseMain(meal,'meal');
  const side = (meal==='breakfast') ? null : chooseAvoiding(sidePool(meal,true), meal+'_side');
  const fruit = pickFruit();
  const juice = pickJuice();

  const tagsHtml=main.tags.map(tg=>`<span class="t t-${tg}">${TAGLABEL()[tg]||tg}</span>`).join('')
    + `<span class="t t-cost">${TSh(main.cost)} / ${t('person','mtu')}</span>`;

  const fav=isFav(main.sw);
  let html=`
    <div class="sgHead"><h2>${t(info.en,info.sw)}</h2>
      <span class="spacer" style="flex:1"></span>
      <button class="fav" data-fav="${escAttr(main.sw)}" aria-pressed="${fav?'true':'false'}">${fav?t('Saved','Imehifadhiwa'):t('Save','Hifadhi')}</button>
    </div>
    <div class="dish">${nm(main)}</div>
    <div class="gloss">${sub(main)}</div>
    <div class="tags">${tagsHtml}</div>

    <div style="margin-top:12px">`;
  if(side) html+=`<div class="lineitem"><span class="k">${t('Serve with','Andama na')}</span><span class="v"><button class="dishbtn" data-recipe-for="${escAttr(side.sw)}">${nm(side)}</button> <a class="ytmini" href="${ytOf(side)}" target="_blank" rel="noopener" title="YouTube">${t('video','video')}</a><small>${sub(side)}</small></span></div>`;
  html+=`<div class="lineitem"><span class="k">${t('Fruit','Tunda')}</span><span class="v"><button class="dishbtn" data-recipe-for="${escAttr(fruit.sw)}">${nm(fruit)}</button> <a class="ytmini" href="${ytOf(fruit)}" target="_blank" rel="noopener" title="YouTube">${t('video','video')}</a><small>${sub(fruit)}</small></span></div>
    <div class="lineitem"><span class="k">${t('Juice','Juisi')}</span><span class="v"><button class="dishbtn" data-recipe-for="${escAttr(juice.sw)}">${nm(juice)}</button> <a class="ytmini" href="${ytOf(juice)}" target="_blank" rel="noopener" title="YouTube">${t('video','video')}</a><small>${sub(juice)}</small></span></div>
    <div class="lineitem"><span class="k">${t('Shopping','Manunuzi')}</span><span class="v" style="font-weight:600">${main.shop}${side?', '+side.shop:''}, ${fruit.sw.toLowerCase()}, ${juice.fruitSw.toLowerCase()}</span></div>
    </div>`;

  const steps=recipeSteps(main);
  html+=`<button class="btn ghost small" data-recipe style="width:100%; margin-top:14px">${t('Show recipe & steps','Onyesha mapishi na hatua')}</button>
    <div class="recipe hidden" id="recipeBox">
      <div><b>${t('Ingredients','Mahitaji')}:</b> ${main.shop}</div>
      <div style="margin-top:8px"><b>${t('How to prepare — step by step','Jinsi ya kuandaa — hatua kwa hatua')}:</b>
        <ol class="rsteps">${(steps||[t('Follow the steps shown in the video below.','Fuata hatua zinazoonyeshwa kwenye video hapa chini.')]).map(s=>`<li>${s}</li>`).join('')}</ol></div>
      <a class="ytbtn" href="${ytOf(main)}" target="_blank" rel="noopener">${t('Or watch it on YouTube','Au tazama kwenye YouTube')}</a>
    </div>`;

  html+=`<div class="row">
      <button class="btn" data-again="${meal}">${t('Another idea','Wazo lingine')}</button>
      <button class="btn ghost small" id="bkHome">${t('Home','Nyumbani')}</button>
    </div>`;
  into.innerHTML=html;
  wireSuggestButtons(into);
  show(into.id);
}

/* ---------- day plan (LOCKED) ---------- */
function suggestDay(into, force){
  let plan=getPlan('day');
  if(!plan || force){ plan=buildDayPlan(); storePlan('day',plan); }
  let html=`<h2 style="margin-top:0">${t("My day plan","Mpango wangu wa siku")}</h2>
    <div class="note lock">${t('Saved on','Umehifadhiwa')} ${planDate(plan.createdAt)} — ${t('this plan stays the same so your shopping is not wasted. It only changes when you tap “New day”.','mpango huu hautabadilika ili manunuzi yako yasipotee. Utabadilika tu ukibonyeza “Siku mpya”.')}</div>`;

  ['breakfast','lunch','dinner'].forEach(m=>{
    const info=MEALINFO[m]; const slot=plan.meals[m];
    const main=dishBySw(slot.main); if(!main) return;
    const side=slot.side?dishBySw(slot.side):null;
    const fruit=fruitBySw(slot.fruit), juice=juiceOf(slot.juice);
    html+=`<div class="daycard">
      <h3>${t(info.en,info.sw)}</h3>
      <div style="font-size:18px"><button class="dishbtn" data-recipe-for="${escAttr(main.sw)}">${nm(main)}</button>
        <a class="ytmini" href="${ytOf(main)}" target="_blank" rel="noopener" title="YouTube">${t('video','video')}</a>
        <span class="muted" style="font-size:13px"> · ${sub(main)}</span></div>
      <div class="muted" style="font-size:13px; margin-top:6px">
        ${side?t('Side','Mboga')+': <button class="dishbtn" style="font-size:13px" data-recipe-for="'+escAttr(side.sw)+'">'+nm(side)+'</button> <a class="ytmini" href="'+ytOf(side)+'" target="_blank" rel="noopener" title="YouTube">'+t('video','video')+'</a> · ':''}${t('Fruit','Tunda')}: <button class="dishbtn" style="font-size:13px" data-recipe-for="${escAttr(fruit.sw)}">${nm(fruit)}</button> <a class="ytmini" href="${ytOf(fruit)}" target="_blank" rel="noopener" title="YouTube">${t('video','video')}</a> · ${t('Juice','Juisi')}: <button class="dishbtn" style="font-size:13px" data-recipe-for="${escAttr(juice.sw)}">${nm(juice)}</button> <a class="ytmini" href="${ytOf(juice)}" target="_blank" rel="noopener" title="YouTube">${t('video','video')}</a></div>
      <div class="muted" style="font-size:12px; margin-top:6px">${t('Tap any name for the steps, or “video” to watch it','Gusa jina lolote upate hatua, au “video” kuitazama')}</div>
    </div>`;
  });

  const cost=planCost(plan,'day');
  html+=`<div class="total"><span>${t('Estimated cost for','Makadirio ya gharama kwa')} ${plan.people} ${t('people','watu')}</span><span class="amt">${TSh(cost)}</span></div>`;
  if(plan.budget) html+=budgetVerdict(cost, plan.budget);
  html+=`<div class="row">
      <button class="btn green" data-again="shop">${t('What to buy','Cha kununua')}</button>
      <button class="btn ghost small" data-new="day">${t('New day','Siku mpya')}</button>
      <button class="btn ghost small" id="bkHome">${t('Home','Nyumbani')}</button>
    </div>`;
  into.innerHTML=html; wireSuggestButtons(into); show(into.id);
}

function budgetVerdict(cost,amount){
  const left=amount-cost;
  return left>=0
    ? `<div class="note lock">${t('Fits your budget of','Inatosha bajeti yako ya')} <b>${TSh(amount)}</b> · <b>${TSh(left)}</b> ${t('left over','zinabaki')}</div>`
    : `<div class="note over"><b>${TSh(-left)}</b> ${t('over your budget of','zaidi ya bajeti yako ya')} <b>${TSh(amount)}</b>. ${t('Make a new plan for cheaper meals.','Tengeneza mpango mpya wa vyakula nafuu.')}</div>`;
}

/* ---------- weekly menu (LOCKED) ---------- */
function suggestWeek(into, force){
  let plan=getPlan('week');
  if(!plan || force){ plan=buildWeekPlan(); storePlan('week',plan); }
  const days = lang==='sw'
    ? ['Jumatatu','Jumanne','Jumatano','Alhamisi','Ijumaa','Jumamosi','Jumapili']
    : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  let html=`<h2 style="margin-top:0">${t('My weekly menu','Menyu yangu ya wiki')}</h2>
    <div class="note lock">${t('Saved on','Umehifadhiwa')} ${planDate(plan.createdAt)} — ${t('this timetable will NOT change on its own. Your shopping list stays valid until you tap “New week” yourself.','ratiba hii HAITABADILIKA yenyewe. Orodha yako ya manunuzi itabaki sahihi hadi wewe mwenyewe ubonyeze “Wiki mpya”.')}</div>`;
  if(plan.filters && plan.filters.length){
    const names=plan.filters.map(k=>{ const f=FILTER_DEFS.find(x=>x.key===k); return f?t(f.en,f.sw):k; }).join(', ');
    html+=`<p class="muted" style="font-size:13px">${t('Filters used','Vichujio vilivyotumika')}: <b>${names}</b></p>`;
  }
  html+=`<table><tr><th>${t('Day','Siku')}</th><th>${t('Breakfast','Asubuhi')}</th><th>${t('Lunch','Mchana')}</th><th>${t('Dinner','Usiku')}</th><th>${t('Fruit & juice','Tunda & juisi')}</th></tr>`;
  const cell=sw=>{ const d=anyBySw(sw); if(!d) return '';
    return `<button class="dishbtn" data-recipe-for="${escAttr(d.sw)}">${d.sw}</button>
      <a class="ytmini" href="${ytOf(d)}" target="_blank" rel="noopener" title="YouTube">${t('video','video')}</a>
      <br><small class="muted">${d.en}</small>`; };
  const mini=(sw,icon)=>{ const d=anyBySw(sw); if(!d) return icon+' '+sw;
    return `${icon} <button class="dishbtn" style="font-weight:400" data-recipe-for="${escAttr(d.sw)}">${d.sw}</button>
      <a class="ytmini" href="${ytOf(d)}" target="_blank" rel="noopener" title="YouTube">${t('video','video')}</a>`; };
  plan.days.forEach((day,i)=>{
    const fr=fruitBySw(day.fruit), jc=juiceOf(day.juice);
    const sideLine = day.side ? `<br><small class="muted">${mini(day.side,t('Side','Mboga')+':')}</small>` : '';
    html+=`<tr><td><b>${days[i]}</b></td><td>${cell(day.b)}</td><td>${cell(day.l)}</td><td>${cell(day.d)}${sideLine}</td>
      <td><small class="muted">${mini(fr.sw,t('Fruit','Tunda')+':')}<br>${mini(jc.sw,t('Juice','Juisi')+':')}</small></td></tr>`;
  });
  html+=`</table>
    <div class="note">${t('Tap any name — food, mboga, fruit or juice — to read the steps. “video” opens a clip of how to cook it, even for foods you added yourself.','Gusa jina lolote — chakula, mboga, tunda au juisi — usome hatua. “video” hufungua klipu ya jinsi ya kupika, hata kwa vyakula ulivyoongeza mwenyewe.')}</div>`;

  const cost=planCost(plan,'week');
  html+=`<div class="total"><span>${t('Estimated cost for','Makadirio ya gharama kwa')} ${plan.people} ${t('people','watu')} / ${t('week','wiki')}</span><span class="amt">${TSh(cost)}</span></div>`;
  if(plan.budget) html+=budgetVerdict(cost, plan.budget);

  html+=`<div class="note">${t('Tip: cook beans or ugali in a bigger pot once, then reuse for two days to save time and money.','Dokezo: pika maharage au ugali kwa wingi mara moja, kisha tumia kwa siku mbili kuokoa muda na pesa.')}</div>
    <div class="row">
      <button class="btn green" data-again="shop">${t('What to buy for this week','Cha kununua kwa wiki hii')}</button>
    </div>
    <div class="row">
      <button class="btn ghost small" data-new="week">${t('New week','Wiki mpya')}</button>
      <button class="btn ghost small" id="bkHome">${t('Home','Nyumbani')}</button>
    </div>`;
  into.innerHTML=html; wireSuggestButtons(into); show(into.id);
}

/* ---------- MY FOODS screen: add / edit the cook's own foods ---------- */
let editingId=null;
let formMeals=['breakfast','lunch','dinner'];

function freqText(f){
  const n=+f.n||0;
  if(!n) return t('whenever it comes','wakati wowote');
  const p=PERIODS.find(x=>x.key===f.per)||PERIODS[1];
  return `<span class="freqbig">${n}×</span> ${t(p.en,p.sw)}`;
}
function whenText(f){
  return mealsOf(f).map(m=>`<span class="whenbadge">${MEALINFO[m].ic} ${t(MEALINFO[m].en,MEALINFO[m].sw)}</span>`).join('');
}
function renderMyFoods(into){
  const list=myFoods();
  const kindName=k=>{ const o=KINDS.find(x=>x.key===k)||KINDS[0]; return t(o.en,o.sw); };
  let html=`<h2 style="margin-top:0">${t('My foods','Vyakula vyangu')}</h2>
    <p class="muted">${t('Write the foods, juices, fruit and mboga your family likes. Say which meal they belong to and how often you want them — the planner will then include them for you.','Andika vyakula, juisi, matunda na mboga anazopenda familia yako. Sema ni mlo gani na mara ngapi unavitaka — kisha mpangaji atavijumuisha.')}</p>`;

  if(list.length){
    html+=`<table class="mytable">
      <tr><th>${t('Food','Chakula')}</th><th>${t('When','Wakati')}</th><th>${t('How often','Mara ngapi')}</th><th></th></tr>`;
    list.forEach(f=>{
      html+=`<tr>
        <td><div class="fname">${escHtml(f.sw)}</div>
            ${f.en?`<div class="fsub">${escHtml(f.en)}</div>`:''}
            <span class="kindtag">${kindName(f.kind)}</span>
            ${f.video?`<span class="kindtag" title="${t('Has your own video','Ina video yako')}">${t('video','video')}</span>`:''}</td>
        <td>${whenText(f)}</td>
        <td>${freqText(f)}</td>
        <td style="white-space:nowrap">
          <button class="iconbtn" data-edit="${escAttr(f.id)}" title="${t('Edit','Hariri')}" aria-label="${t('Edit','Hariri')} ${escAttr(f.sw)}">${t('Edit','Hariri')}</button>
          <button class="iconbtn" data-del="${escAttr(f.id)}" title="${t('Delete','Futa')}" aria-label="${t('Delete','Futa')} ${escAttr(f.sw)}">${t('Delete','Futa')}</button>
        </td></tr>`;
    });
    html+=`</table>
      <div class="note lock">${t('Your saved weekly menu will not change by itself. Tap “New week” on the weekly menu when you are ready to use these foods.','Menyu yako ya wiki iliyohifadhiwa haitabadilika yenyewe. Bonyeza “Wiki mpya” kwenye menyu ya wiki ukiwa tayari kutumia vyakula hivi.')}</div>`;
  } else {
    html+=`<p class="muted">${t('Nothing added yet. Use the form below to add your first food.','Bado hakuna kilichoongezwa. Tumia fomu hapa chini kuongeza chakula chako cha kwanza.')}</p>`;
  }

  const ed = editingId ? list.find(f=>f.id===editingId) : null;
  if(ed) formMeals=mealsOf(ed).slice();
  html+=`<div class="mfform">
    <h3>${ed?t('Edit food','Hariri chakula'):t('Add a food','Ongeza chakula')}</h3>
    <label class="mflabel" for="mfName">${t('Name (Kiswahili)','Jina (Kiswahili)')}</label>
    <input class="field" id="mfName" placeholder="${t('e.g. Ndizi nyama','mf. Ndizi nyama')}" value="${ed?escAttr(ed.sw):''}" />
    <div class="mfgrid">
      <div><label class="mflabel" for="mfEn">${t('English name (optional)','Jina la Kiingereza (hiari)')}</label>
        <input class="field" id="mfEn" value="${ed&&ed.en?escAttr(ed.en):''}" /></div>
      <div><label class="mflabel" for="mfKind">${t('Type','Aina')}</label>
        <select class="field" id="mfKind">${KINDS.map(k=>`<option value="${k.key}" ${ed&&ed.kind===k.key?'selected':''}>${t(k.en,k.sw)}</option>`).join('')}</select></div>
    </div>
    <label class="mflabel">${t('When do you want it?','Unaitaka wakati gani?')}</label>
    <div class="mfchips" id="mfMeals">
      ${['breakfast','lunch','dinner'].map(m=>`<span class="chip${formMeals.includes(m)?' on':''}" data-meal-pick="${m}" role="button" tabindex="0">${MEALINFO[m].ic} ${t(MEALINFO[m].en,MEALINFO[m].sw)}</span>`).join('')}
    </div>
    <label class="mflabel" for="mfN">${t('How many times?','Mara ngapi?')}</label>
    <div class="freqrow">
      <input class="field" id="mfN" type="number" min="0" max="21" inputmode="numeric" value="${ed?(+ed.n||0):1}" />
      <select class="field" id="mfPer">${PERIODS.map(p=>`<option value="${p.key}" ${ed&&ed.per===p.key?'selected':(!ed&&p.key==='week'?'selected':'')}>${t(p.en,p.sw)}</option>`).join('')}</select>
    </div>
    <p class="muted" style="font-size:12px; margin:6px 0 0">${t('Put 0 for “whenever it comes”.','Weka 0 kwa “wakati wowote”.')}</p>

    <label class="mflabel" for="mfVideo">${t('Video link (optional)','Kiungo cha video (hiari)')}</label>
    <input class="field" id="mfVideo" type="url" inputmode="url" placeholder="https://youtube.com/..." value="${ed&&ed.video?escAttr(ed.video):''}" />
    <p class="muted" style="font-size:12px; margin:6px 0 0">${t('Saw it on social media? Paste the link here. If you leave it empty I will still find you a cooking video on YouTube.','Umekiona kwenye mitandao? Bandika kiungo hapa. Ukiacha wazi, bado nitakutafutia video ya kupika kwenye YouTube.')}</p>

    <details class="more" ${ed&&(ed.cost||ed.shop||(ed.steps&&ed.steps.length))?'open':''}>
      <summary>${t('More details (optional)','Maelezo zaidi (hiari)')}</summary>
      <div class="mfgrid">
        <div><label class="mflabel" for="mfCost">${t('Cost per person (TSh)','Gharama kwa mtu (TSh)')}</label>
          <input class="field" id="mfCost" type="number" min="0" inputmode="numeric" value="${ed&&ed.cost?ed.cost:''}" /></div>
        <div><label class="mflabel" for="mfVeg">${t('Vegetarian?','Ni mboga tu?')}</label>
          <select class="field" id="mfVeg"><option value="no" ${ed&&!ed.veg?'selected':''}>${t('No','Hapana')}</option><option value="yes" ${ed&&ed.veg?'selected':''}>${t('Yes','Ndiyo')}</option></select></div>
      </div>
      <label class="mflabel" for="mfShop">${t('Ingredients to buy (separate with commas)','Mahitaji ya kununua (tenganisha kwa koma)')}</label>
      <input class="field" id="mfShop" placeholder="${t('e.g. ndizi, nyama, nyanya','mf. ndizi, nyama, nyanya')}" value="${ed&&ed.shop?escAttr(ed.shop):''}" />
      <label class="mflabel" for="mfSteps">${t('How to prepare — one step per line','Jinsi ya kuandaa — hatua moja kila mstari')}</label>
      <textarea class="field" id="mfSteps" placeholder="${t('Fry the onions...\nAdd the meat...','Kaanga vitunguu...\nOngeza nyama...')}">${ed&&ed.steps?escHtml(ed.steps.join('\n')):''}</textarea>
    </details>

    <div id="mfErr" class="autherr hidden"></div>
    <div class="row">
      <button class="btn green" id="mfSave">${ed?t('Save changes','Hifadhi mabadiliko'):t('Add to my foods','Ongeza kwenye vyakula vyangu')}</button>
    </div>
    ${ed?`<div class="row"><button class="btn ghost small" id="mfCancel">${t('Cancel','Ghairi')}</button></div>`:''}
  </div>
  <div class="row"><button class="btn ghost small" id="bkHome">${t('Home','Nyumbani')}</button></div>`;

  into.innerHTML=html; wireSuggestButtons(into); show(into.id);

  // meal chips
  into.querySelectorAll('[data-meal-pick]').forEach(c=>{
    const toggle=()=>{ const m=c.dataset.mealPick;
      const i=formMeals.indexOf(m);
      if(i<0) formMeals.push(m); else formMeals.splice(i,1);
      c.classList.toggle('on', formMeals.includes(m)); };
    c.onclick=toggle;
    c.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } };
  });
  into.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{ editingId=b.dataset.edit; renderMyFoods(into); into.scrollIntoView({behavior:'smooth'}); });
  into.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
    const f=myFoods().find(x=>x.id===b.dataset.del); if(!f) return;
    if(!window.confirm(t('Remove "'+f.sw+'" from your foods?','Ondoa "'+f.sw+'" kwenye vyakula vyako?'))) return;
    saveMyFoods(myFoods().filter(x=>x.id!==b.dataset.del));
    if(editingId===b.dataset.del) editingId=null;
    renderMyFoods(into);
  });
  const cancel=into.querySelector('#mfCancel');
  if(cancel) cancel.onclick=()=>{ editingId=null; formMeals=['breakfast','lunch','dinner']; renderMyFoods(into); };
  into.querySelector('#mfSave').onclick=()=>saveMyFoodForm(into);
}
function saveMyFoodForm(into){
  const err=m=>{ const e=$('mfErr'); e.textContent=m; e.classList.remove('hidden'); };
  const name=$('mfName').value.trim();
  if(!name) return err(t('Please write the name of the food.','Tafadhali andika jina la chakula.'));
  if(!formMeals.length) return err(t('Choose at least one meal (breakfast, lunch or dinner).','Chagua angalau mlo mmoja (asubuhi, mchana au usiku).'));
  const kind=$('mfKind').value;
  const n=Math.min(21,Math.max(0,+$('mfN').value||0));
  const arr=myFoods();
  const clash=arr.find(f=>f.sw.toLowerCase()===name.toLowerCase() && f.id!==editingId);
  if(clash) return err(t('You already added a food with that name.','Tayari umeongeza chakula chenye jina hilo.'));
  const entry={
    id: editingId || ('mf'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)),
    sw: name,
    en: $('mfEn').value.trim(),
    kind,
    meals: formMeals.slice(),
    n, per: $('mfPer').value,
    veg: $('mfVeg').value==='yes' || kind!=='main',
    cost: Math.max(0,+$('mfCost').value||0) || DEFAULT_COST[kind],
    shop: $('mfShop').value.trim(),
    video: safeUrl($('mfVideo').value),
    steps: $('mfSteps').value.split('\n').map(s=>s.trim()).filter(Boolean),
  };
  const typed=$('mfVideo').value.trim();
  if(typed && !entry.video) return err(t('That video link must start with http:// or https://','Kiungo cha video lazima kianze na http:// au https://'));
  const i=arr.findIndex(f=>f.id===entry.id);
  if(i>-1) arr[i]=entry; else arr.push(entry);
  saveMyFoods(arr);
  editingId=null; formMeals=['breakfast','lunch','dinner'];
  renderMyFoods(into);
}

/* ---------- favourites ---------- */
function favList(d){ const u=currentUser(d); return u?(u.favs=u.favs||[]):[]; }
function isFav(sw){ return favList(load()).includes(sw); }
function toggleFav(sw){ const d=load(); const f=favList(d); const i=f.indexOf(sw);
  if(i<0) f.push(sw); else f.splice(i,1); save(d); return i<0; }
function renderFavs(into){
  const d=load(); const favs=favList(d).slice();
  let html=`<h2 style="margin-top:0">${t('My favourites','Vipendwa vyangu')}</h2>`;
  if(!favs.length){
    html+=`<p class="muted">${t('No favourites yet. Tap “Save” on any dish to keep it here.','Bado hakuna vipendwa. Gusa “Hifadhi” kwenye chakula chochote ili kikae hapa.')}</p>`;
  } else {
    favs.forEach(sw=>{
      const dish=dishBySw(sw)||{sw, en:''};
      html+=`<div class="lineitem"><span class="v" style="flex:1"><button class="dishbtn" data-recipe-for="${escAttr(sw)}">${nm(dish)}</button><small>${sub(dish)}</small></span>
        <button class="fav on" data-fav="${escAttr(sw)}" aria-pressed="true">${t('Saved','Imehifadhiwa')}</button></div>`;
    });
  }
  html+=`<div class="row"><button class="btn ghost small" id="bkHome">${t('Home','Nyumbani')}</button></div>`;
  into.innerHTML=html; wireSuggestButtons(into); show(into.id);
}

/* ---------- account screen ---------- */
function renderAccount(into){
  const u=currentUser(); if(!u) return show('auth');
  const d=load();
  const okMsg=(el,msg)=>{ el.textContent=msg; el.className='autherr ok'; el.classList.remove('hidden'); };
  const badMsg=(el,msg)=>{ el.textContent=msg; el.className='autherr'; el.classList.remove('hidden'); };

  into.innerHTML=`
    <h2 style="margin-top:0">${t('My account','Akaunti yangu')}</h2>
    <div class="lineitem"><span class="k">${t('Name','Jina')}</span><span class="v">${escHtml(u.name)}</span></div>
    <div class="lineitem"><span class="k">${t('Email','Barua pepe')}</span><span class="v">${escHtml(d.session||'')}</span></div>
    <div class="lineitem"><span class="k">${t('Sync','Usawazishaji')}</span><span class="v">${
      CC.isOffline() ? ''+t('Offline — saved on this device','Hakuna mtandao — imehifadhiwa kwenye kifaa hiki')
      : CC.hasPendingWork() ? ''+t('Saving…','Inahifadhi…')
      : ''+t('Saved to your account','Imehifadhiwa kwenye akaunti yako')}
      <small>${t('Log in on any phone or laptop to find the same kitchen.','Ingia kwenye simu au kompyuta yoyote upate jikoni lilelile.')}</small></span></div>

    <h3 style="margin:20px 0 4px; font-size:16px">${t('Change password','Badilisha nenosiri')}</h3>
    <p class="muted" style="font-size:12px; margin:0">${t('Changing it signs out your other devices.','Ukibadilisha, vifaa vyako vingine vitatolewa.')}</p>
    <form id="pwForm">
      <input class="field" type="password" id="pwOld" autocomplete="current-password" placeholder="${t('Current password','Nenosiri la sasa')}" />
      <input class="field" type="password" id="pwNew" autocomplete="new-password" placeholder="${t('New password','Nenosiri jipya')}" />
      <div id="pwMsg" class="autherr hidden" role="alert"></div>
      <div class="row"><button class="btn small" type="submit" id="pwBtn">${t('Change password','Badilisha nenosiri')}</button></div>
    </form>

    <details class="more"><summary>${t('Delete my account','Futa akaunti yangu')}</summary>
      <p class="muted" style="font-size:13px">${t('This removes your account and everything in it — favourites, plans and your own foods — from every device. It cannot be undone.','Hii itaondoa akaunti yako na kila kitu ndani yake — vipendwa, mipango na vyakula vyako — kwenye kila kifaa. Haiwezi kurudishwa.')}</p>
      <form id="delForm">
        <input class="field" type="password" id="delPass" autocomplete="current-password" placeholder="${t('Your password','Nenosiri lako')}" />
        <div id="delMsg" class="autherr hidden" role="alert"></div>
        <div class="row"><button class="btn small danger" type="submit">${t('Delete for ever','Futa milele')}</button></div>
      </form>
    </details>

    <div class="row">
      <button class="btn ghost small" id="bkHome">${t('Home','Nyumbani')}</button>
      <button class="btn ghost small" id="acctOut">${t('Log out','Toka')}</button>
    </div>`;

  into.querySelector('#pwForm').onsubmit=async e=>{
    e.preventDefault();
    const msg=into.querySelector('#pwMsg'), btn=into.querySelector('#pwBtn');
    const next=into.querySelector('#pwNew').value;
    if(next.length<MIN_PASSWORD) return badMsg(msg, authMessage('password_short'));
    btn.disabled=true;
    try{
      await CC.changePassword(into.querySelector('#pwOld').value, next);
      into.querySelector('#pwOld').value=''; into.querySelector('#pwNew').value='';
      okMsg(msg, t('Password changed. Your other devices have been signed out.','Nenosiri limebadilishwa. Vifaa vyako vingine vimetolewa.'));
    }catch(err){
      badMsg(msg, err && err.status===403 ? t('That current password is not right.','Nenosiri la sasa si sahihi.') : authMessage(err&&err.status?err.message:'offline'));
    }
    btn.disabled=false;
  };

  into.querySelector('#delForm').onsubmit=async e=>{
    e.preventDefault();
    const msg=into.querySelector('#delMsg');
    if(!window.confirm(t('Delete your account and everything in it for ever?','Kufuta akaunti yako na kila kitu ndani yake milele?'))) return;
    try{
      await CC.deleteAccount(into.querySelector('#delPass').value);
      CC.forgetLegacy();
      location.reload();
    }catch(err){
      badMsg(msg, err && err.status===403 ? t('That password is not right.','Nenosiri hilo si sahihi.') : authMessage(err&&err.status?err.message:'offline'));
    }
  };

  into.querySelector('#bkHome').onclick=()=>{ refreshHome(); show('home'); };
  into.querySelector('#acctOut').onclick=logout;
  show(into.id);
}

/* ---------- accounts ----------
   The account lives on the server, so the same kitchen opens on any device.
   Passwords are only ever sent to the server to be checked; nothing about
   them is kept here.                                                       */
let authMode='login';
const MIN_PASSWORD=8;
/* the logged-in account, or null — every screen except the login page needs one */
function currentUser(d){ d=d||load(); return (d.session && d.users && d.users[d.session]) || null; }
function isLoggedIn(){ return !!currentUser(); }
function setAuthMode(m){
  authMode=m;
  $('tabLogin').classList.toggle('on',m==='login');
  $('tabSignup').classList.toggle('on',m==='signup');
  $('aName').classList.toggle('hidden',m!=='signup');
  $('aPass2').classList.toggle('hidden',m!=='signup');
  $('aPass').setAttribute('autocomplete', m==='signup'?'new-password':'current-password');
  const b=$('aSubmit');
  b.dataset.en = m==='signup'?'Create account':'Log in';
  b.dataset.sw = m==='signup'?'Fungua akaunti':'Ingia';
  b.textContent = t(b.dataset.en,b.dataset.sw);
  $('aErr').classList.add('hidden');
}
function authErr(msg){ const e=$('aErr'); e.textContent=msg; e.classList.remove('hidden'); }
function authBusy(on){
  const b=$('aSubmit');
  b.disabled=on;
  b.textContent = on ? t('Please wait…','Subiri kidogo…') : t(b.dataset.en,b.dataset.sw);
}
/* Server answers are short codes so both languages can be spoken here. */
function authMessage(code){
  switch(code){
    case 'email_required':   return t('Please enter your email address.','Tafadhali andika barua pepe yako.');
    case 'email_invalid':    return t('Please enter a valid email address.','Tafadhali andika barua pepe sahihi.');
    case 'password_required':return t('Please enter your password.','Tafadhali andika nenosiri lako.');
    case 'password_short':   return t('Password must be at least '+MIN_PASSWORD+' characters.','Nenosiri liwe na herufi '+MIN_PASSWORD+' au zaidi.');
    case 'password_long':    return t('That password is too long.','Nenosiri hilo ni refu mno.');
    case 'name_required':    return t('Please enter your name.','Tafadhali andika jina lako.');
    case 'name_long':        return t('That name is too long.','Jina hilo ni refu mno.');
    case 'email_taken':      return t('That email already has an account — log in instead.','Barua pepe hiyo tayari ina akaunti — ingia badala yake.');
    case 'bad_credentials':  return t('Wrong email or password — try again.','Barua pepe au nenosiri si sahihi — jaribu tena.');
    case 'too_many_attempts':return t('Too many tries. Please wait a few minutes and try again.','Umejaribu mara nyingi mno. Subiri dakika chache kisha jaribu tena.');
    case 'offline':          return t('No connection. You need to be online to log in the first time on a device.','Hakuna mtandao. Unahitaji mtandao ili kuingia mara ya kwanza kwenye kifaa.');
    default:                 return t('Something went wrong. Please try again.','Kuna hitilafu. Tafadhali jaribu tena.');
  }
}
async function doAuth(){
  const email=$('aEmail').value.trim().toLowerCase();
  const pass=$('aPass').value;
  if(!email) return authErr(authMessage('email_required'));
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return authErr(authMessage('email_invalid'));
  if(!pass) return authErr(authMessage('password_required'));
  if(pass.length<MIN_PASSWORD) return authErr(authMessage('password_short'));
  const name=$('aName').value.trim();
  if(authMode==='signup'){
    if(!name) return authErr(authMessage('name_required'));
    if($('aPass2').value!==pass) return authErr(t('The two passwords do not match.','Manenosiri mawili hayafanani.'));
  }

  authBusy(true);
  try{
    if(authMode==='signup'){
      await CC.signup(name,email,pass);
      const legacy=CC.legacyData();
      if(legacy){ await CC.uploadLegacy(legacy); CC.forgetLegacy(); }
    } else {
      await CC.login(email,pass);
    }
  } catch(err){
    authBusy(false);
    return authErr(authMessage(err && err.status ? err.message : 'offline'));
  }
  authBusy(false);
  $('aPass').value=''; $('aPass2').value=''; $('aErr').classList.add('hidden');
  enterApp();
}
/** Everything that has to happen once an account is open. */
function enterApp(){
  hydrateSettings();
  applyLang(); renderFilters();
  updateUserPill(); refreshHome(); show('home');
}
async function logout(){
  const pill=$('userPill'); pill.style.pointerEvents='none';
  try{ await CC.logout(); } finally { pill.style.pointerEvents=''; }
  $('aPass').value=''; $('aPass2').value='';
  updateUserPill(); setAuthMode('login'); show('auth');
}
function updateUserPill(){
  const u=currentUser();
  $('userPill').classList.toggle('hidden', !u);
  if(u) $('userName').textContent=u.name.split(' ')[0];
}

/* ---------- screens / wiring ---------- */
function show(id){
  /* no screen but the login page is reachable without an account */
  if(id!=='auth' && !isLoggedIn()) id='auth';
  ['auth','home','suggest','multi'].forEach(s=>$(s).classList.toggle('hidden', s!==id));
  if(id==='auth') $('aEmail').focus();
}
function refreshHome(){
  const h=new Date().getHours();
  const u=currentUser();
  const g=(h<12?t('Good morning','Habari za asubuhi'):h<17?t('Good afternoon','Habari za mchana'):t('Good evening','Habari za jioni'));
  $('greet').textContent=g+(u?', '+u.name.split(' ')[0]:'')+'!';
  updateBudgetUI();
}
function escAttr(s){ return String(s).replace(/"/g,'&quot;'); }
/* Names and emails come from people, so they never go into HTML unescaped. */
function escHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function renderFilters(){
  const row=$('filterRow');
  row.innerHTML=`<span class="muted">${t('Filters:','Vichujio:')}</span>`;
  FILTER_DEFS.forEach(f=>{
    const el=document.createElement('span');
    el.className='chip'+(filters[f.key]?' on':'');
    el.textContent=t(f.en,f.sw);
    el.setAttribute('role','button'); el.tabIndex=0;
    el.onclick=()=>{ filters[f.key]=!filters[f.key]; el.classList.toggle('on',filters[f.key]);
      persistSettings(); updateBudgetUI(); };
    el.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); el.click(); } };
    row.appendChild(el);
  });
}
function updateBudgetUI(){
  $('budgetBox').classList.toggle('hidden', !filters.budget);
  $('bAmount').value = budget.amount||'';
  $('bPeople').value = budget.people||4;
  const hint=$('bHint');
  if(budgetActive()){
    const perDay=budget.amount/7;
    hint.innerHTML=`${t('That is about','Hiyo ni takribani')} <b>${TSh(perDay)}</b> ${t('per day for','kwa siku kwa')} ${budget.people} ${t('people','watu')}. ${t('I will suggest meals that fit.','Nitapendekeza vyakula vinavyotosha.')}`;
  } else {
    hint.textContent=t('Type how much you have and I will plan meals that fit it.','Andika kiasi ulichonacho nami nitapanga vyakula vinavyotosha.');
  }
}
$('bAmount').oninput=()=>{ budget.amount=Math.max(0,+$('bAmount').value||0); persistSettings(); updateBudgetUI(); };
$('bPeople').oninput=()=>{ budget.people=Math.min(20,Math.max(1,+$('bPeople').value||1)); persistSettings(); updateBudgetUI(); };

function route(meal){
  if(!isLoggedIn()) return show('auth');
  if(meal==='day')  return suggestDay($('multi'), false);
  if(meal==='week') return suggestWeek($('multi'), false);
  if(meal==='favs') return renderFavs($('multi'));
  if(meal==='shop') return renderShopping($('multi'));
  if(meal==='myfoods'){ editingId=null; formMeals=['breakfast','lunch','dinner']; return renderMyFoods($('multi')); }
  return suggestMeal(meal, $('suggest'));
}
function confirmNew(type){
  const has = !!getPlan(type);
  if(!has) return true;
  const msg = type==='week'
    ? t('Make a NEW weekly menu?\n\nYour current timetable and its shopping list will be replaced — food you already bought may not match the new plan.',
        'Kutengeneza menyu MPYA ya wiki?\n\nRatiba yako ya sasa na orodha yake ya manunuzi vitabadilishwa — vyakula ulivyokwisha nunua vinaweza visiendane na mpango mpya.')
    : t('Make a NEW day plan?\n\nThe current plan and its shopping list will be replaced.',
        'Kutengeneza mpango MPYA wa siku?\n\nMpango wa sasa na orodha yake ya manunuzi vitabadilishwa.');
  return window.confirm(msg);
}
function wireSuggestButtons(scope){
  scope.querySelectorAll('[data-again]').forEach(b=>b.onclick=()=>route(b.dataset.again));
  scope.querySelectorAll('[data-new]').forEach(b=>b.onclick=()=>{
    const type=b.dataset.new;
    if(!confirmNew(type)) return;
    if(type==='week') suggestWeek($('multi'), true); else suggestDay($('multi'), true);
  });
  const home=scope.querySelector('#bkHome'); if(home) home.onclick=()=>{refreshHome();show('home');};
  const rt=scope.querySelector('[data-recipe]');
  if(rt) rt.onclick=()=>{
    const box=scope.querySelector('#recipeBox');
    const hidden=box.classList.toggle('hidden');
    rt.textContent = hidden ? ''+t('Show recipe & steps','Onyesha mapishi na hatua')
                            : ''+t('Hide recipe','Ficha mapishi');
  };
  scope.querySelectorAll('[data-fav]').forEach(h=>h.onclick=()=>{
    const sw=h.dataset.fav; const now=toggleFav(sw);
    h.textContent = now ? t('Saved','Imehifadhiwa') : t('Save','Hifadhi');
    h.classList.toggle('on', now); h.setAttribute('aria-pressed', now?'true':'false');
  });
}

document.querySelectorAll('.tile').forEach(tl=>tl.onclick=()=>route(tl.dataset.meal));
$('favBtn').onclick=()=>route('favs');

['tabLogin','tabSignup'].forEach(id=>{
  const el=$(id), mode=id==='tabLogin'?'login':'signup';
  el.onclick=()=>setAuthMode(mode);
  el.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setAuthMode(mode); } };
});
$('authForm').onsubmit=e=>{ e.preventDefault(); doAuth(); };
$('userPill').onclick=logout;
$('accountBtn').onclick=()=>renderAccount($('multi'));

/* ---------- sync indicator ---------- */
const SYNC_TEXT={
  saved:   ()=>[''+t('Saved','Imehifadhiwa'), t('Everything is saved to your account.','Kila kitu kimehifadhiwa kwenye akaunti yako.')],
  saving:  ()=>[''+t('Saving…','Inahifadhi…'), t('Sending your changes to your account.','Inatuma mabadiliko yako kwenye akaunti yako.')],
  pending: ()=>[''+t('Saving…','Inahifadhi…'), t('Your changes are about to be sent.','Mabadiliko yako yanakaribia kutumwa.')],
  offline: ()=>[''+t('Offline','Hakuna mtandao'), t('No connection. Your kitchen is safe on this device and will sync when you are back online.','Hakuna mtandao. Jikoni lako liko salama kwenye kifaa hiki na litasawazishwa ukirudi mtandaoni.')],
};
function renderSync(state){
  const pill=$('syncPill');
  if(state==='merged'){ onMergedFromAnotherDevice(); return; }
  if(state==='out'){ pill.classList.add('hidden'); return; }
  const build=SYNC_TEXT[state]||SYNC_TEXT.saved;
  const [label,title]=build();
  pill.classList.remove('hidden');
  pill.classList.toggle('warn', state==='offline');
  pill.textContent=label;
  pill.title=title;
}
/* Another device pushed while this one was away — take the merged result and
   redraw, so the cook is never looking at a menu the server has replaced. */
function onMergedFromAnotherDevice(){
  hydrateSettings(); applyLang(); renderFilters();
  if(!$('home').classList.contains('hidden')) refreshHome();
}
CC.onStatus(renderSync);
CC.onSignedOut(()=>{
  updateUserPill(); setAuthMode('login'); show('auth');
  authErr(t('You were signed out. Please log in again.','Umetolewa. Tafadhali ingia tena.'));
});

/* ---------- start ---------- */
applyLang();
setAuthMode('login');
renderFilters();
updateUserPill();
(async function boot(){
  let where='out';
  try{ where=await CC.start(); }
  finally{ $('splash').classList.add('hidden'); }
  if(where==='in' || where==='offline') enterApp(); else show('auth');
})();
