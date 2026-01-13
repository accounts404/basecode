import { jsPDF } from 'jspdf';
import { format, addDays, isWeekend } from 'date-fns';

const urlToBase64 = async (url) => {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error fetching image for PDF:", error);
    return null;
  }
};

// Function to calculate business days (excluding weekends)
const addBusinessDays = (date, days) => {
  let currentDate = new Date(date);
  let addedDays = 0;
  
  while (addedDays < days) {
    currentDate = addDays(currentDate, 1);
    if (!isWeekend(currentDate)) {
      addedDays++;
    }
  }
  
  return currentDate;
};

// Translation mapping for service names
const translateServiceName = (spanishName) => {
  const translations = {
    // Initial services
    'Primera Limpieza': 'First Cleaning',
    'Spring Cleaning': 'Spring Cleaning',
    'One Off': 'One Off',
    'Limpieza Profunda': 'Deep Cleaning',
    
    // Regular services
    'Semanal': 'Weekly',
    'Quincenal': 'Fortnightly',
    'Cada 3 Semanas': 'Every 3 Weeks',
    'Mensual': 'Monthly',
    'Bi-Weekly': 'Bi-Weekly',
    'Regular': 'Regular',
    // Commercial services would be added here if needed, e.g.,
    // 'Limpieza de Oficinas': 'Office Cleaning',
  };
  
  return translations[spanishName] || spanishName;
};

export const generateQuotePDF = async ({ quote, client, systemSettings }) => {
  // Create PDF with compression enabled
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
    compress: true
  });
  
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  let y = 20;

  // Logo - use custom logo if provided, otherwise use default
  const logoUrl = systemSettings?.company_logo_url || 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/783a1a8cd_RedOakLogo.png';
  const logoBase64 = await urlToBase64(logoUrl);
  if (logoBase64) {
    try {
      // Logo size: 40mm width x 32mm height (maintains 500x400 aspect ratio)
      doc.addImage(logoBase64, 'PNG', margin, y, 40, 32);
    } catch (e) {
      console.error("Error adding logo:", e);
    }
  }

  // Company Info (right side)
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('RedOak Clean & Trusted', pageWidth - margin, y + 5, { align: 'right' });
  doc.text('info@redoakcleaning.com.au', pageWidth - margin, y + 10, { align: 'right' });
  if (systemSettings?.company_phone) {
    doc.text(systemSettings.company_phone, pageWidth - margin, y + 15, { align: 'right' });
  }
  if (systemSettings?.company_abn) {
    doc.text(`ABN: ${systemSettings.company_abn}`, pageWidth - margin, y + 20, { align: 'right' });
  }

  // Adjust Y position after logo (logo is now 32mm tall instead of 13mm, and we want to leave some space)
  y += 40;

  // Quote Title - Color: #00628B (RGB: 0, 98, 139)
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0, 98, 139); // Updated color from 34, 139, 34
  doc.text('SERVICE QUOTATION', pageWidth / 2, y, { align: 'center' });

  y += 15;

  // Client and Quote Info
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('CLIENT INFORMATION:', margin, y);
  
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  y += 7;
  doc.text(`Name: ${client.name}`, margin, y);
  y += 5;
  doc.text(`Email: ${client.email}`, margin, y);
  y += 5;
  if (client.mobile_number) {
    doc.text(`Phone: ${client.mobile_number}`, margin, y);
    y += 5;
  }
  doc.text(`Service Address: ${quote.service_address}`, margin, y);
  y += 5;
  
  // Quote Date
  const quoteDate = new Date(quote.quote_date);
  doc.text(`Quote Date: ${format(quoteDate, 'dd/MM/yyyy')}`, margin, y);
  y += 5;
  
  // Expire Date (14 business days after quote date)
  const expireDate = addBusinessDays(quoteDate, 14);
  doc.text(`Valid Until: ${format(expireDate, 'dd/MM/yyyy')}`, margin, y);
  y += 12;

  // Notes (if any)
  if (quote.notes && quote.notes.trim()) {
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('SPECIAL NOTES:', margin, y);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    y += 6;
    const notesLines = doc.splitTextToSize(quote.notes, pageWidth - 2 * margin);
    doc.text(notesLines, margin, y);
    y += notesLines.length * 4 + 8;
  }

  // Helper function to check if we need a new page
  const checkNewPage = (requiredSpace) => {
    if (y + requiredSpace > pageHeight - 30) {
      doc.addPage();
      y = 20;
      return true;
    }
    return false;
  };

  // INITIAL SERVICES SECTION - Color: #009FE3 (RGB: 0, 159, 227)
  const hasInitial = quote.selected_services?.some(s => s.service_type === 'initial');
  if (hasInitial) {
    checkNewPage(60);
    
    // Section Header with new color
    doc.setFillColor(0, 159, 227); // Updated color from 255, 140, 0
    doc.rect(margin, y, pageWidth - 2 * margin, 10, 'F');
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('INITIAL SERVICES', pageWidth / 2, y + 7, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 15;

    doc.setFontSize(9);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('(Spring Cleaning, One Off, First Cleaning)', pageWidth / 2, y, { align: 'center' });
    y += 8;

    // Services and Prices
    const initialServices = quote.selected_services.filter(s => s.service_type === 'initial');
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Service Options (choose one):', margin, y);
    y += 6;

    doc.setFont(undefined, 'normal');
    initialServices.forEach(service => {
      checkNewPage(6);
      const translatedName = translateServiceName(service.service_name);
      doc.text(`• ${translatedName}`, margin + 5, y);
      doc.text(`$${service.price_min} - $${service.price_max}`, pageWidth - margin, y, { align: 'right' });
      y += 5;
    });

    y += 5;

    // Areas and Items
    if (quote.selected_areas_items_initial && quote.selected_areas_items_initial.length > 0) {
      checkNewPage(30);
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Areas and Services Included:', margin, y);
      y += 7;

      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      
      quote.selected_areas_items_initial.forEach(area => {
        checkNewPage(15);
        doc.setFont(undefined, 'bold');
        doc.text(`${area.area_display_name}:`, margin + 3, y);
        y += 5;
        doc.setFont(undefined, 'normal');
        
        if (area.selection_type === 'full') {
          doc.setFont(undefined, 'bold');
          doc.text('• Full Service - All items included:', margin + 8, y);
          y += 5;
          doc.setFont(undefined, 'normal');
          
          if (area.selected_items && area.selected_items.length > 0) {
            area.selected_items.forEach(item => {
              checkNewPage(5);
              const itemText = `  - ${item.item_name}`;
              const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
              doc.text(lines, margin + 12, y);
              y += lines.length * 4;
            });
          }
        } else if (area.selected_items && area.selected_items.length > 0) {
          area.selected_items.forEach(item => {
            checkNewPage(5);
            const itemText = `• ${item.item_name}`;
            const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
            doc.text(lines, margin + 8, y);
            y += lines.length * 4;
          });
        }
        
        if (area.area_notes && area.area_notes.trim()) {
          checkNewPage(10);
          doc.setFont(undefined, 'italic');
          doc.setTextColor(80, 80, 80);
          const notesLines = doc.splitTextToSize(`Notes: ${area.area_notes}`, pageWidth - margin - 15);
          doc.text(notesLines, margin + 8, y);
          y += notesLines.length * 4 + 2;
          doc.setFont(undefined, 'normal');
          doc.setTextColor(0, 0, 0);
        }
        
        y += 3;
      });
    }

    y += 5;

    // ADDITIONAL OPTIONS FOR INITIAL SERVICES
    const initialOptions = quote.service_options?.filter(opt => opt.service_type === 'initial') || [];
    if (initialOptions.length > 0) {
      initialOptions.forEach((option, index) => {
        checkNewPage(40);
        
        // Option Header
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 159, 227);
        doc.text(`INITIAL SERVICE OPTION #${index + 2} - ${option.option_name}`, margin, y);
        y += 8;
        doc.setTextColor(0, 0, 0);

        // Pricing
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('Service Options (choose one):', margin, y);
        y += 6;

        doc.setFont(undefined, 'normal');
        if (option.pricing?.one_off) {
          checkNewPage(6);
          doc.text(`• One-Off Service`, margin + 5, y);
          doc.text(`$${option.pricing.one_off.price_min} - $${option.pricing.one_off.price_max}`, pageWidth - margin, y, { align: 'right' });
          y += 5;
        }

        y += 5;

        // Areas and Items
        if (option.selected_areas_items && option.selected_areas_items.length > 0) {
          checkNewPage(30);
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.text('Areas and Services Included:', margin, y);
          y += 7;

          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          
          option.selected_areas_items.forEach(area => {
            if (area.selection_type === 'not_included') return;
            
            checkNewPage(15);
            doc.setFont(undefined, 'bold');
            doc.text(`${area.area_display_name}:`, margin + 3, y);
            y += 5;
            doc.setFont(undefined, 'normal');
            
            if (area.selection_type === 'full') {
              doc.setFont(undefined, 'bold');
              doc.text('• Full Service - All items included:', margin + 8, y);
              y += 5;
              doc.setFont(undefined, 'normal');
              
              if (area.selected_items && area.selected_items.length > 0) {
                area.selected_items.forEach(item => {
                  checkNewPage(5);
                  const itemText = `  - ${item.item_name}`;
                  const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
                  doc.text(lines, margin + 12, y);
                  y += lines.length * 4;
                });
              }
            } else if (area.selected_items && area.selected_items.length > 0) {
              area.selected_items.forEach(item => {
                checkNewPage(5);
                const itemText = `• ${item.item_name}`;
                const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
                doc.text(lines, margin + 8, y);
                y += lines.length * 4;
              });
            }
            
            y += 3;
          });
        }

        y += 10;
      });
    }

    y += 5;
  }

  // REGULAR SERVICES SECTION - Color: #EA5B1B (RGB: 234, 91, 27)
  const hasRegular = quote.selected_services?.some(s => s.service_type === 'regular');
  if (hasRegular) {
    checkNewPage(60);
    
    // Section Header with new color
    doc.setFillColor(234, 91, 27); // Updated color from 34, 139, 34
    doc.rect(margin, y, pageWidth - 2 * margin, 10, 'F');
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('REGULAR SERVICES', pageWidth / 2, y + 7, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 15;

    doc.setFontSize(9);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('(Weekly, Fortnightly, Every 3 Weeks, Monthly)', pageWidth / 2, y, { align: 'center' });
    y += 8;

    // Services and Prices
    const regularServices = quote.selected_services.filter(s => s.service_type === 'regular');
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Service Options (choose one):', margin, y);
    y += 6;

    doc.setFont(undefined, 'normal');
    regularServices.forEach(service => {
      checkNewPage(6);
      const translatedName = translateServiceName(service.service_name);
      doc.text(`• ${translatedName}`, margin + 5, y);
      doc.text(`$${service.price_min} - $${service.price_max}`, pageWidth - margin, y, { align: 'right' });
      y += 5;
    });

    y += 5;

    // Areas and Items
    if (quote.selected_areas_items_regular && quote.selected_areas_items_regular.length > 0) {
      checkNewPage(30);
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Areas and Services Included:', margin, y);
      y += 7;

      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      
      quote.selected_areas_items_regular.forEach(area => {
        checkNewPage(15);
        doc.setFont(undefined, 'bold');
        doc.text(`${area.area_display_name}:`, margin + 3, y);
        y += 5;
        doc.setFont(undefined, 'normal');
        
        if (area.selection_type === 'full') {
          doc.setFont(undefined, 'bold');
          doc.text('• Full Service - All items included:', margin + 8, y);
          y += 5;
          doc.setFont(undefined, 'normal');
          
          if (area.selected_items && area.selected_items.length > 0) {
            area.selected_items.forEach(item => {
              checkNewPage(5);
              const itemText = `  - ${item.item_name}`;
              const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
              doc.text(lines, margin + 12, y);
              y += lines.length * 4;
            });
          }
        } else if (area.selected_items && area.selected_items.length > 0) {
          area.selected_items.forEach(item => {
            checkNewPage(5);
            const itemText = `• ${item.item_name}`;
            const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
            doc.text(lines, margin + 8, y);
            y += lines.length * 4;
          });
        }
        
        if (area.area_notes && area.area_notes.trim()) {
          checkNewPage(10);
          doc.setFont(undefined, 'italic');
          doc.setTextColor(80, 80, 80);
          const notesLines = doc.splitTextToSize(`Notes: ${area.area_notes}`, pageWidth - margin - 15);
          doc.text(notesLines, margin + 8, y);
          y += notesLines.length * 4 + 2;
          doc.setFont(undefined, 'normal');
          doc.setTextColor(0, 0, 0);
        }
        
        y += 3;
      });
    }

    y += 5;

    // ADDITIONAL OPTIONS FOR REGULAR SERVICES
    const regularOptions = quote.service_options?.filter(opt => opt.service_type === 'regular') || [];
    if (regularOptions.length > 0) {
      const frequencyLabels = {
        weekly: 'Weekly',
        fortnightly: 'Fortnightly',
        every_3_weeks: 'Every 3 Weeks',
        monthly: 'Monthly'
      };

      regularOptions.forEach((option, index) => {
        checkNewPage(40);
        
        // Option Header
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(234, 91, 27);
        doc.text(`REGULAR SERVICE OPTION #${index + 2} - ${option.option_name}`, margin, y);
        y += 8;
        doc.setTextColor(0, 0, 0);

        // Pricing
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('Service Options (choose one):', margin, y);
        y += 6;

        doc.setFont(undefined, 'normal');
        Object.keys(frequencyLabels).forEach(freq => {
          if (option.pricing?.[freq] && option.pricing[freq].enabled !== false) {
            checkNewPage(6);
            doc.text(`• ${frequencyLabels[freq]}`, margin + 5, y);
            doc.text(`$${option.pricing[freq].price_min} - $${option.pricing[freq].price_max}`, pageWidth - margin, y, { align: 'right' });
            y += 5;
          }
        });

        y += 5;

        // Areas and Items
        if (option.selected_areas_items && option.selected_areas_items.length > 0) {
          checkNewPage(30);
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.text('Areas and Services Included:', margin, y);
          y += 7;

          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          
          option.selected_areas_items.forEach(area => {
            if (area.selection_type === 'not_included') return;
            
            checkNewPage(15);
            doc.setFont(undefined, 'bold');
            doc.text(`${area.area_display_name}:`, margin + 3, y);
            y += 5;
            doc.setFont(undefined, 'normal');
            
            if (area.selection_type === 'full') {
              doc.setFont(undefined, 'bold');
              doc.text('• Full Service - All items included:', margin + 8, y);
              y += 5;
              doc.setFont(undefined, 'normal');
              
              if (area.selected_items && area.selected_items.length > 0) {
                area.selected_items.forEach(item => {
                  checkNewPage(5);
                  const itemText = `  - ${item.item_name}`;
                  const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
                  doc.text(lines, margin + 12, y);
                  y += lines.length * 4;
                });
              }
            } else if (area.selected_items && area.selected_items.length > 0) {
              area.selected_items.forEach(item => {
                checkNewPage(5);
                const itemText = `• ${item.item_name}`;
                const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
                doc.text(lines, margin + 8, y);
                y += lines.length * 4;
              });
            }
            
            y += 3;
          });
        }

        y += 10;
      });
    }

    y += 5;
  }

  // COMMERCIAL SERVICES SECTION - Color: #8B5CF6 (RGB: 139, 92, 246)
  const hasCommercial = quote.selected_services?.some(s => s.service_type === 'commercial');
  if (hasCommercial) {
    checkNewPage(60);
    
    // Section Header
    doc.setFillColor(139, 92, 246);
    doc.rect(margin, y, pageWidth - 2 * margin, 10, 'F');
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('COMMERCIAL SERVICES', pageWidth / 2, y + 7, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 15;

    doc.setFontSize(9);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('(Offices, Stores, Businesses)', pageWidth / 2, y, { align: 'center' });
    y += 8;

    // Services and Prices
    const commercialServices = quote.selected_services.filter(s => s.service_type === 'commercial');
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Service Options (choose one):', margin, y);
    y += 6;

    doc.setFont(undefined, 'normal');
    commercialServices.forEach(service => {
      checkNewPage(6);
      const translatedName = translateServiceName(service.service_name);
      doc.text(`• ${translatedName}`, margin + 5, y);
      doc.text(`$${service.price_min} - $${service.price_max}`, pageWidth - margin, y, { align: 'right' });
      y += 5;
    });

    y += 5;

    // Areas and Items
    if (quote.selected_areas_items_commercial && quote.selected_areas_items_commercial.length > 0) {
      checkNewPage(30);
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Areas and Services Included:', margin, y);
      y += 7;

      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      
      quote.selected_areas_items_commercial.forEach(area => {
        checkNewPage(15);
        doc.setFont(undefined, 'bold');
        doc.text(`${area.area_display_name}:`, margin + 3, y);
        y += 5;
        doc.setFont(undefined, 'normal');
        
        if (area.selection_type === 'full') {
          doc.setFont(undefined, 'bold');
          doc.text('• Full Service - All items included:', margin + 8, y);
          y += 5;
          doc.setFont(undefined, 'normal');
          
          if (area.selected_items && area.selected_items.length > 0) {
            area.selected_items.forEach(item => {
              checkNewPage(5);
              const itemText = `  - ${item.item_name}`;
              const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
              doc.text(lines, margin + 12, y);
              y += lines.length * 4;
            });
          }
        } else if (area.selected_items && area.selected_items.length > 0) {
          area.selected_items.forEach(item => {
            checkNewPage(5);
            const itemText = `• ${item.item_name}`;
            const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
            doc.text(lines, margin + 8, y);
            y += lines.length * 4;
          });
        }
        
        if (area.area_notes && area.area_notes.trim()) {
          checkNewPage(10);
          doc.setFont(undefined, 'italic');
          doc.setTextColor(80, 80, 80);
          const notesLines = doc.splitTextToSize(`Notes: ${area.area_notes}`, pageWidth - margin - 15);
          doc.text(notesLines, margin + 8, y);
          y += notesLines.length * 4 + 2;
          doc.setFont(undefined, 'normal');
          doc.setTextColor(0, 0, 0);
        }
        
        y += 3;
      });
    }

    y += 5;

    // ADDITIONAL OPTIONS FOR COMMERCIAL SERVICES
    const commercialOptions = quote.service_options?.filter(opt => opt.service_type === 'commercial') || [];
    if (commercialOptions.length > 0) {
      const frequencyLabels = {
        weekly: 'Weekly',
        fortnightly: 'Fortnightly',
        every_3_weeks: 'Every 3 Weeks',
        monthly: 'Monthly'
      };

      commercialOptions.forEach((option, index) => {
        checkNewPage(40);
        
        // Option Header
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(139, 92, 246);
        doc.text(`COMMERCIAL SERVICE OPTION #${index + 2} - ${option.option_name}`, margin, y);
        y += 8;
        doc.setTextColor(0, 0, 0);

        // Pricing
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('Service Options (choose one):', margin, y);
        y += 6;

        doc.setFont(undefined, 'normal');
        Object.keys(frequencyLabels).forEach(freq => {
          if (option.pricing?.[freq] && option.pricing[freq].enabled !== false) {
            checkNewPage(6);
            doc.text(`• ${frequencyLabels[freq]}`, margin + 5, y);
            doc.text(`$${option.pricing[freq].price_min} - $${option.pricing[freq].price_max}`, pageWidth - margin, y, { align: 'right' });
            y += 5;
          }
        });

        y += 5;

        // Areas and Items
        if (option.selected_areas_items && option.selected_areas_items.length > 0) {
          checkNewPage(30);
          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.text('Areas and Services Included:', margin, y);
          y += 7;

          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          
          option.selected_areas_items.forEach(area => {
            if (area.selection_type === 'not_included') return;
            
            checkNewPage(15);
            doc.setFont(undefined, 'bold');
            doc.text(`${area.area_display_name}:`, margin + 3, y);
            y += 5;
            doc.setFont(undefined, 'normal');
            
            if (area.selection_type === 'full') {
              doc.setFont(undefined, 'bold');
              doc.text('• Full Service - All items included:', margin + 8, y);
              y += 5;
              doc.setFont(undefined, 'normal');
              
              if (area.selected_items && area.selected_items.length > 0) {
                area.selected_items.forEach(item => {
                  checkNewPage(5);
                  const itemText = `  - ${item.item_name}`;
                  const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
                  doc.text(lines, margin + 12, y);
                  y += lines.length * 4;
                });
              }
            } else if (area.selected_items && area.selected_items.length > 0) {
              area.selected_items.forEach(item => {
                checkNewPage(5);
                const itemText = `• ${item.item_name}`;
                const lines = doc.splitTextToSize(itemText, pageWidth - margin - 15);
                doc.text(lines, margin + 8, y);
                y += lines.length * 4;
              });
            }
            
            y += 3;
          });
        }

        y += 10;
      });
    }

    y += 5;
  }

  // ADDITIONAL SERVICES SECTION (EXTRAS) - Color: #7C3AED (RGB: 124, 58, 237)
  const hasExtras = (quote.cost_steam_vacuum > 0 || quote.cost_oven > 0 || quote.cost_windows_cleaning > 0);
  if (hasExtras) {
    checkNewPage(40);
    
    // Section Header
    doc.setFillColor(124, 58, 237);
    doc.rect(margin, y, pageWidth - 2 * margin, 10, 'F');
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('ADDITIONAL SERVICES', pageWidth / 2, y + 7, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 15;

    doc.setFontSize(9);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('(Optional add-ons to any service)', pageWidth / 2, y, { align: 'center' });
    y += 10;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    
    if (quote.cost_steam_vacuum > 0) {
      checkNewPage(6);
      doc.text(`• Steam Vacuum (${quote.rooms_for_steam_vacuum} rooms)`, margin + 5, y);
      doc.text(`$${quote.cost_steam_vacuum.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
      y += 5;
    }
    if (quote.cost_oven > 0) {
      checkNewPage(6);
      doc.text(`• Oven Cleaning`, margin + 5, y);
      doc.text(`$${quote.cost_oven.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
      y += 5;
    }
    if (quote.cost_windows_cleaning > 0) {
      checkNewPage(6);
      doc.text(`• Windows Cleaning`, margin + 5, y);
      doc.text(`$${quote.cost_windows_cleaning.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
      y += 5;
    }

    y += 10;
  }

  // TERMS AND CONDITIONS - OPTIMIZED FORMATTING
  if (systemSettings?.terms_and_conditions && systemSettings.terms_and_conditions.trim()) {
    checkNewPage(50);
    
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('TERMS AND CONDITIONS', pageWidth / 2, y + 6, { align: 'center' });
    y += 12;

    // Use smaller font size for terms to reduce pages
    doc.setFontSize(6.5);
    doc.setTextColor(60, 60, 60);
    
    const lines = systemSettings.terms_and_conditions.split('\n');
    const maxWidth = pageWidth - 2 * margin;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      checkNewPage(4);
      
      if (line.trim() === '') {
        y += 2.5;
        continue;
      }
      
      const startsWithBullet = line.trim().startsWith('●') || line.trim().startsWith('•') || line.trim().startsWith('%Ï') || line.trim().startsWith('*');
      
      // Title or header
      if (line.trim().length > 0 && line === line.toUpperCase() && line.trim().length < 80 && !startsWithBullet) {
        doc.setFont(undefined, 'bold');
        const wrappedLines = doc.splitTextToSize(line.trim(), maxWidth);
        wrappedLines.forEach(wLine => {
          checkNewPage(4);
          doc.text(wLine, margin, y);
          y += 3.5;
        });
        doc.setFont(undefined, 'normal');
        y += 0.5;
        continue;
      }
      
      // Bullet point
      if (startsWithBullet) {
        let bulletText = line.trim();
        if (bulletText.startsWith('%Ï')) {
          bulletText = bulletText.substring(2).trim();
        } else if (bulletText.startsWith('*')) {
          bulletText = bulletText.substring(1).trim();
        } else {
          bulletText = bulletText.substring(1).trim();
        }
        
        const wrappedLines = doc.splitTextToSize(bulletText, maxWidth - 6);
        
        checkNewPage(4);
        doc.text('●', margin + 2, y);
        doc.text(wrappedLines[0], margin + 6, y);
        y += 3.5;
        
        for (let j = 1; j < wrappedLines.length; j++) {
          checkNewPage(4);
          doc.text(wrappedLines[j], margin + 6, y);
          y += 3.5;
        }
        y += 0.5;
        continue;
      }
      
      // Regular text
      const wrappedLines = doc.splitTextToSize(line.trim(), maxWidth);
      wrappedLines.forEach(wLine => {
        checkNewPage(4);
        doc.text(wLine, margin, y);
        y += 3.5;
      });
    }

    y += 8;
  }

  // Footer
  y = pageHeight - 15;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.setFont(undefined, 'italic');
  doc.text('Thank you for choosing RedOak Clean & Trusted', pageWidth / 2, y, { align: 'center' });
  doc.text('info@redoakcleaning.com.au', pageWidth / 2, y + 4, { align: 'center' });

  return doc;
}