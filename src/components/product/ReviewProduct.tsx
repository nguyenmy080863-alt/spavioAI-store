import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";

const CustomStar = ({ filled, onClick, className }: { filled: boolean; onClick: () => void; className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 20 20" 
    fill="currentColor" 
    className={`w-5 h-5 cursor-pointer ${filled ? 'text-foreground' : 'text-muted-foreground/30'} ${className}`}
    onClick={onClick}
  >
    <path 
      fillRule="evenodd" 
      d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" 
      clipRule="evenodd" 
    />
  </svg>
);

const ReviewProduct = () => {
  const { t } = useTranslation("shop");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const submitReview = () => {
    // Simple submission logic - in a real app this would send to backend
    console.log("Review submitted:", { rating, review });
    setIsOpen(false);
    setRating(0);
    setReview("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className="w-full h-12 font-medium rounded-full border-accent text-accent hover:bg-accent hover:text-accent-foreground"
        >
          {t("reviewProduct.reviewProduct")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md !rounded-none">
        <DialogHeader>
          <DialogTitle className="font-light text-xl">{t("reviewProduct.reviewProduct")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-light text-foreground">{t("reviewProduct.rating")}</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <CustomStar
                  key={star}
                  filled={star <= rating}
                  onClick={() => setRating(star)}
                />
              ))}
            </div>
          </div>
          
          <div className="space-y-3">
            <label className="text-sm font-light text-foreground">{t("reviewProduct.yourReview")}</label>
            <Textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder={t("reviewProduct.placeholder")}
              className="min-h-24 resize-none rounded-none font-light"
            />
          </div>
          
          <Button 
            onClick={submitReview}
            disabled={rating === 0 || review.trim() === ""}
            className="w-full h-12 font-semibold rounded-full bg-brand-gradient text-white shadow-glow hover:brightness-110 transition-[filter]"
          >
            {t("reviewProduct.submitReview")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReviewProduct;