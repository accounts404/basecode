
import { format } from "date-fns";
import { es } from "date-fns/locale";

// Helper function to convert number to words
const numberToWords = (num) => {
  const a = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'
  ];
  const b = [
    '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'
  ];

  const inWords = (n) => {
    if (n < 20) return a[n];
    let digit = n % 10;
    if (n < 100) return b[Math.floor(n / 10)] + (digit ? '-' + a[digit] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' hundred' + (n % 100 === 0 ? '' : ' ' + inWords(n % 100));
    if (n < 1000000) return inWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    return 'Number too large';
  };

  if (num === 0) return 'zero';
  let words = inWords(Math.floor(num));
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const generateInvoicePDF = async (user, invoiceNumber, workEntries, totalAmount, createdDate) => {
  try {
    // Import jsPDF dynamically
    const { jsPDF } = await import('jspdf');
    
    const doc = new jsPDF();
    
    // Helper function to get user data with fallback
    const get = (obj, path, fallback = '**********') => {
      const value = path.split('.').reduce((acc, part) => acc && acc[part], obj);
      return value || fallback;
    };

    const fullName = get(user, 'invoice_name', get(user, 'full_name', 'NAME AND LAST NAME'));
    const totalInWords = numberToWords(totalAmount);

    // Calculate daily totals
    const dailyTotals = workEntries.reduce((acc, entry) => {
      const date = entry.work_date;
      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += entry.total_amount;
      return acc;
    }, {});

    const sortedDates = Object.keys(dailyTotals).sort((a, b) => new Date(a) - new Date(b));

    // Set up document
    let y = 20;
    
    // Personal Info (Right aligned)
    doc.setFontSize(14);
    doc.text(fullName, 200, y, { align: 'right' });
    y += 8;
    
    doc.setFontSize(11);
    doc.text(`ABN: ${get(user, 'abn')}`, 200, y, { align: 'right' });
    y += 5;
    doc.text(`Mobile Number: ${get(user, 'mobile_number')}`, 200, y, { align: 'right' });
    y += 5;
    doc.text(`Address: ${get(user, 'address')}`, 200, y, { align: 'right' });
    y += 5;
    const invoiceDate = createdDate ? new Date(createdDate) : new Date();
    doc.text(`Date: ${format(invoiceDate, 'd MMMM yyyy', { locale: es })}`, 200, y, { align: 'right' });
    y += 5;
    doc.text(`Invoice: ${invoiceNumber.replace('INV-', '')}`, 200, y, { align: 'right' });
    
    // Invoice To Section
    y += 25;
    doc.setFontSize(12);
    doc.text('TAX INVOICE TO:', 20, y);
    y += 8;
    
    doc.setFontSize(11);
    doc.text('RedOak Cleaning Solutions', 20, y);
    y += 5;
    doc.text('Mobile Number: 0491829501', 20, y);
    
    // Terms Section
    y += 25;
    doc.setFontSize(12);
    doc.text('TERMS:', 20, y);
    y += 8;
    
    doc.setFontSize(11);
    doc.text('1. Cleaning Service:', 20, y);
    y += 10;
    
    // Service list
    doc.text('Month/day: $value', 32, y);
    y += 8;
    
    // Add services (removed the "ej." line)
    sortedDates.forEach(date => {
      const formattedDate = format(new Date(date), "d 'de' MMMM 'de' yyyy", { locale: es });
      const amount = dailyTotals[date].toFixed(2); // Changed from toFixed(0) to toFixed(2)
      doc.text(`• ${formattedDate}: $${amount}`, 32, y);
      y += 5;
    });
    
    // Total Section
    y += 15;
    doc.text(`Total: $${totalAmount.toFixed(2)}`, 20, y); // Changed from toFixed(0) to toFixed(2)
    y += 8;
    doc.text(`${totalInWords} AUD $${totalAmount.toFixed(2)}`, 20, y); // Changed from toFixed(0) to toFixed(2)
    
    // Banking Details
    y += 25;
    doc.setFontSize(12);
    doc.text('BANKING DETAILS:', 20, y);
    y += 8;
    
    doc.setFontSize(11);
    doc.text(`Account Name: ${get(user, 'account_name', '*******')}`, 20, y);
    y += 5;
    doc.text(`Account Number: ${get(user, 'account_number', '*******')}`, 20, y);
    y += 5;
    doc.text(`BSB: ${get(user, 'bsb', '*******')}`, 20, y);
    y += 5;
    doc.text(`Bank: ${get(user, 'bank', '*******')}`, 20, y);

    // Generate PDF blob
    const pdfBlob = doc.output('blob');
    
    return pdfBlob;
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Error al generar el PDF: ' + error.message);
  }
};

// Function to download PDF directly
export const downloadInvoicePDF = async (user, invoiceNumber, workEntries, totalAmount, filename, createdDate) => {
  try {
    const pdfBlob = await generateInvoicePDF(user, invoiceNumber, workEntries, totalAmount, createdDate);
    
    // Create download link
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `Invoice_${invoiceNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Error downloading PDF:', error);
    throw error;
  }
};
