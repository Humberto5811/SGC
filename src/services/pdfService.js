class PDFService {
  generateSimplePdf(title, content) {
    if (!window.jspdf) {
      console.warn('jsPDF no disponible');
      return null;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    doc.setFontSize(14);
    doc.text(title, 40, 50);
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(content, 520);
    doc.text(lines, 40, 80);
    doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
    return doc;
  }
}

const pdfService = new PDFService();
export { pdfService as PDFService };
