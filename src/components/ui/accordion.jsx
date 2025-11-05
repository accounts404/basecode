import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const AccordionContext = React.createContext();

const Accordion = ({ children, type = "single", collapsible = false, ...props }) => {
  const [openItems, setOpenItems] = useState(new Set());

  const toggleItem = (value) => {
    if (type === "single") {
      if (openItems.has(value) && collapsible) {
        setOpenItems(new Set());
      } else {
        setOpenItems(new Set([value]));
      }
    } else {
      // type === "multiple"
      const newOpenItems = new Set(openItems);
      if (newOpenItems.has(value)) {
        newOpenItems.delete(value);
      } else {
        newOpenItems.add(value);
      }
      setOpenItems(newOpenItems);
    }
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggleItem }}>
      <div {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
};

const AccordionItem = React.forwardRef(({ className = "", value, children, ...props }, ref) => {
  return (
    <AccordionContext.Provider value={{ ...React.useContext(AccordionContext), value }}>
      <div ref={ref} className={`border-b ${className}`} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
});
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef(({ className = "", children, ...props }, ref) => {
  const { openItems, toggleItem, value } = React.useContext(AccordionContext);
  const isOpen = openItems.has(value);

  const handleClick = (e) => {
    e.preventDefault();
    toggleItem(value);
    if (props.onClick) {
      props.onClick(e);
    }
  };

  return (
    <div className="flex">
      <button
        ref={ref}
        className={`flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline ${className}`}
        onClick={handleClick}
        {...props}
      >
        {children}
        <ChevronDown 
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </button>
    </div>
  );
});
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef(({ className = "", children, ...props }, ref) => {
  const { openItems, value } = React.useContext(AccordionContext);
  const isOpen = openItems.has(value);

  return (
    <div
      ref={ref}
      className={`overflow-hidden text-sm transition-all duration-200 ${
        isOpen ? 'animate-accordion-down' : 'animate-accordion-up'
      }`}
      style={{
        maxHeight: isOpen ? '1000px' : '0px',
        opacity: isOpen ? 1 : 0,
      }}
      {...props}
    >
      <div className={`pb-4 pt-0 ${className}`}>
        {children}
      </div>
    </div>
  );
});
AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };