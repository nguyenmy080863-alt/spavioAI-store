import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const StatusBar = () => {
  const { t } = useTranslation("shop");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fadeState, setFadeState] = useState("opacity-100 translate-y-0");

  const usps = [
    t("statusBar.freeShipping"),
    t("statusBar.warranty"),
    t("statusBar.happyCustomers")
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      // Start fade out and slide down
      setFadeState("opacity-0 translate-y-1");
      
      setTimeout(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % usps.length);
        // Reset position to slide in from top
        setFadeState("opacity-0 -translate-y-1");
        
        // Trigger slide-in/fade-in
        setTimeout(() => {
          setFadeState("opacity-100 translate-y-0");
        }, 50);
      }, 3000); // Wait for transition duration
    }, 4500);

    return () => clearInterval(interval);
  }, [usps.length]);

  return (
    <div className="bg-brand-gradient text-white py-2 relative overflow-hidden">
      <div className="container mx-auto px-4 text-center">
        <p 
          className={`text-[10px] sm:text-xs tracking-[0.2em] font-medium uppercase transition-all duration-500 ease-out ${fadeState}`}
        >
          {usps[currentIndex]}
        </p>
      </div>
    </div>
  );
};

export default StatusBar;