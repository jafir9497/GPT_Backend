export const COMPANY_BRANDING = {
  // Company Information
  companyName: 'GPT Gold Loan',
  tagline: 'Doorstep Gold Loan Service',
  
  // Contact Information
  address: {
    line1: 'No 6, Y Block, Sivananth Building (Basement)',
    line2: 'Anna Nagar, Chennai',
    city: 'Chennai',
    state: 'Tamil Nadu',
    country: 'India',
    fullAddress: 'No 6, Y Block, Sivananth Building (Basement), Anna Nagar, Chennai, Tamil Nadu, India'
  },
  
  contact: {
    phone: '+91 73393 37747',
    email: 'gptjewellerygoldloan@gmail.com',
    website: 'www.gptgoldloan.com'
  },
  
  // Brand Colors (GPT Red Theme)
  colors: {
    primary: '#F21905',        // GPT Red
    secondary: '#730C02',      // Deep Burgundy
    accent: '#F23827',         // Accent Red
    lightGray: '#D9D9D9',      // Light Gray
    darkGray: '#0D0D0D',       // Dark Gray
    white: '#FFFFFF',          // White
    success: '#28A745',        // Success Green
    warning: '#FFC107',        // Warning Yellow
    error: '#F21905',          // Error (Primary Red)
    info: '#007BFF'            // Info Blue
  },
  
  // Logo Assets (relative paths from backend)
  logos: {
    red: './assets/logos/Red.png',          // Red logo for white backgrounds
    white: './assets/logos/White.png'       // White logo for dark backgrounds
  },
  
  // Document Templates
  templates: {
    watermark: 'GPT GOLD LOAN - CONFIDENTIAL',
    footer: 'This is a computer-generated document from GPT Gold Loan Services.',
    disclaimer: 'This document is generated automatically and does not require a physical signature.'
  },
  
  // Legal Information
  legal: {
    companyRegistration: 'GPT Gold Loan Services Pvt. Ltd.',
    licenseNumber: 'GL-TN-2024-001', // Placeholder - replace with actual license
    gstNumber: '33ABCDE1234F1Z5',    // Placeholder - replace with actual GST
    cinNumber: 'U65999TN2024PTC123456' // Placeholder - replace with actual CIN
  },
  
  // Bank Details (for customer payments)
  bankDetails: {
    bankName: 'ICICI Bank',
    accountName: 'GPT Gold Loan Services Pvt. Ltd.',
    accountNumber: '123456789012',     // Placeholder - replace with actual
    ifscCode: 'ICIC0001234',          // Placeholder - replace with actual
    branch: 'Anna Nagar, Chennai'
  },
  
  // Business Hours
  businessHours: {
    weekdays: '9:00 AM - 6:00 PM',
    saturday: '9:00 AM - 2:00 PM',
    sunday: 'Closed',
    holidays: 'As per Government of Tamil Nadu holiday calendar'
  },
  
  // Social Media (placeholders)
  socialMedia: {
    facebook: 'https://facebook.com/gptgoldloan',
    twitter: 'https://twitter.com/gptgoldloan',
    instagram: 'https://instagram.com/gptgoldloan',
    linkedin: 'https://linkedin.com/company/gptgoldloan'
  }
};

// Helper functions for document generation
export const getBrandingForDocument = () => ({
  header: {
    companyName: COMPANY_BRANDING.companyName,
    tagline: COMPANY_BRANDING.tagline,
    address: COMPANY_BRANDING.address.fullAddress,
    phone: COMPANY_BRANDING.contact.phone,
    email: COMPANY_BRANDING.contact.email
  },
  footer: {
    legal: COMPANY_BRANDING.legal.companyRegistration,
    contact: `${COMPANY_BRANDING.contact.phone} | ${COMPANY_BRANDING.contact.email}`,
    disclaimer: COMPANY_BRANDING.templates.disclaimer
  },
  colors: COMPANY_BRANDING.colors
});

export const getFormattedAddress = (): string => {
  const addr = COMPANY_BRANDING.address;
  return `${addr.line1}\n${addr.line2}\n${addr.city}, ${addr.state}\n${addr.country}`;
};

export const getContactInfo = (): string => {
  return `Phone: ${COMPANY_BRANDING.contact.phone}\nEmail: ${COMPANY_BRANDING.contact.email}`;
};

export const getBankDetails = () => COMPANY_BRANDING.bankDetails;

export const getLegalInfo = () => COMPANY_BRANDING.legal;