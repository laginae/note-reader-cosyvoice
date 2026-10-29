'use strict';
// Invented, publishable text only. Geometry deliberately mixes PDF reading order.
const viewport = { width: 600, height: 800 };
const item = (str, x, y, fontName = 'body', size = 12, width = str.length * 5) =>
  ({str, width, height:size, fontName, transform:[size,0,0,size,x,y]});
const cases = [
  { name:'column order', items:[item('Left first.',40,740,'body',12,220),item('Right first.',330,740,'body',12,220),
    item('Left next.',40,720,'body',12,220),item('Right next.',330,720,'body',12,220),
    item('Left last.',40,700,'body',12,220),item('Right last.',330,700,'body',12,220)],
    expected:/Left first\. Left next\. Left last\. Right first\. Right next\. Right last\./ },
  { name:'line wrapping', items:[item('An ordinary expla-',40,740),item('nation continues here.',40,724)], expected:/explanation continues/ },
  { name:'encoded inline operator', items:[item('For',40,740),item('q',65,740,'italic'),item('\u0d4c',75,740,'encoded'),item('2',85,740),item('the result holds.',100,740)], expected:/q equals 2/ },
  { name:'Greek letters', items:[item('Compare',40,740),item('\u03b1',85,740,'greek'),item('\u0d51',95,740,'encoded'),item('\u03b2',105,740,'greek')], expected:/alpha less than beta/ },
  { name:'display math', items:[item('A generic equation follows.',40,740,'body',12,450),
    item('k',210,718,'italic',8),item('y',180,700,'italic'),item('\u0d4c \u0dcd',195,700,'encoded'),item('z',225,700,'italic'),
    item('j',200,686,'italic',8),item('\u0b40',210,686,'encoded',8),item('0',218,686,'body',8),item('(9)',290,675),
    item('a',200,665,'italic'),item('y',180,650,'italic'),item('\u0d4c \u0da8',195,650,'encoded'),item('b',220,650,'italic'),
    item('Ordinary ending.',40,610,'body',12,450)],expected:/Formula\./ },
];
// A damaged font is decoded only after a multi-symbol signature is established.
// Isolated lookalike characters deliberately remain unchanged in the parser.
for (const index of [2,3]) cases[index].items = [...cases[4].items.slice(0,-1),
  ...cases[index].items.map(row=>({...row,transform:[...row.transform.slice(0,5),row.transform[5]-160]}))];
const golden = [
  'Left first. Left next. Left last. Right first. Right next. Right last.',
  'An ordinary explanation continues here.',
  'A generic equation follows. Formula. For q equals 2 the result holds.',
  'A generic equation follows. Formula. Compare alpha less than beta',
  'A generic equation follows. Formula. Ordinary ending.',
];
cases.forEach((fixture, index) => { fixture.golden = golden[index]; });
cases.push({ name:'repeated text scope', items:[item('Same public sentence.',40,740),item('Different middle.',40,715),item('Same public sentence.',40,690)],
  golden:'Same public sentence. Different middle. Same public sentence.' });
cases.push({ name:'plain numeric prose', items:[item('The library opens at 9:30.',40,740),item('There are 24 seats.',40,715)],
  golden:'The library opens at 9:30. There are 24 seats.' });
module.exports = {cases,viewport};
