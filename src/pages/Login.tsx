import AuthForm from "@/components/auth/AuthForm";
import SEO from "@/components/SEO";

const Login = () => (
  <>
    <SEO
      page="login"
      canonical="/login"
      noindex={true}
    />
    <AuthForm mode="signin" />
  </>
);

export default Login;

