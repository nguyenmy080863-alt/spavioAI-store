import { useTranslation } from "react-i18next";

interface Store {
  name: string;
  address: string;
  phone: string;
  hours: string;
  lat: number;
  lng: number;
}

const stores: Store[] = [
  {
    name: "Spavio AI Showroom Neumarkt",
    address: "Glasergasse 18, 92318 Neumarkt",
    phone: "+49 176 84941650",
    hours: "By appointment",
    lat: 49.2797,
    lng: 11.4608
  }
];

const StoreMap = () => {
  const { t } = useTranslation("about");

  return (
    <div className="w-full h-96 rounded-lg overflow-hidden border border-border bg-muted/10 relative">
      {/* Static Map using Google Maps Embed API */}
      <iframe
        src="https://www.google.com/maps?q=Glasergasse+18,+92318+Neumarkt+in+der+Oberpfalz&output=embed"
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="w-full h-full"
      />
      
      {/* Overlay with store markers */}
      <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm rounded-lg p-4 max-w-xs">
        <h4 className="text-sm font-medium text-foreground mb-3">{t("storeLocator.map.ourLocations")}</h4>
        <div className="space-y-2">
          {stores.map((store, index) => (
            <div key={index} className="text-xs">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                <span className="font-medium text-foreground">{store.name}</span>
              </div>
              <p className="text-muted-foreground ml-4">{store.address}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StoreMap;