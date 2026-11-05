import fs from 'node:fs';

const html = fs.readFileSync('output/pccegoa.edu.in/bundle/rendered.html', 'utf8');

const b1 = html.indexOf('class="elementor-element elementor-element-770cf44');
console.log('Button 1 (770cf44) HTML:');
console.log(html.substring(b1, b1 + 600));

const b2 = html.indexOf('class="elementor-element elementor-element-391be7d');
console.log('\nButton 2 (391be7d) HTML:');
console.log(html.substring(b2, b2 + 600));
