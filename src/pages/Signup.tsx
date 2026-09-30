import AuthForm from "@/components/auth/AuthForm";
import SEO from "@/components/SEO";

const Signup = () => (
  <>
    <SEO
      page="signup"
      canonical="/signup"
      noindex={true}
    />
    <AuthForm mode="signup" />
  </>
);

export default Signup;

