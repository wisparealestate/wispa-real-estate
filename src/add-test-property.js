// Run this in your browser console on the admin.html page to add a test property with a document to localStorage
(function(){
  const properties = JSON.parse(localStorage.getItem('properties') || '[]');
  properties.push({
    id: 'test-001',
    name: 'Test Property',
    location: 'Test City',
    price: 123456,
    document: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    documentFormat: 'PDF',
    posted: new Date().toISOString()
  });
  localStorage.setItem('properties', JSON.stringify(properties));
  alert('Test property with document added! Switch to the Documents tab to see it.');
})();
