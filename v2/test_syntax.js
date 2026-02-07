// Test script to validate ws.js syntax
try {
    require('./static/js/ws.js');
    console.log('Syntax OK');
} catch (e) {
    console.error('Syntax Error:', e.message);
    console.error('Stack:', e.stack);
}
