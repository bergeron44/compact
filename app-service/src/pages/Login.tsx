import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveSession } from "@/lib/session";
import { findUserByEmployeeId, registerUser } from "@/lib/userStore";
import { Monitor, Shield, Zap } from "lucide-react";

const Login = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState("login");

  // Login state
  const [loginId, setLoginId] = useState("");
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});

  // Register state
  const [regId, setRegId] = useState("");
  const [regName, setRegName] = useState("");
  const [regProject, setRegProject] = useState("");
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});

  const handleLogin = async () => {
    const errors: Record<string, string> = {};
    if (!loginId.trim()) errors.id = "Employee ID is required";
    else if (!/^\d+$/.test(loginId)) errors.id = "Employee ID must be numeric";
    setLoginErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const user = await findUserByEmployeeId(loginId.trim());
    if (!user) {
      setLoginErrors({ id: "Employee ID not found. Please register first." });
      return;
    }

    saveSession({
      name: user.fullName,
      employeeId: user.employeeId,
      projectName: user.projectName,
      loginTimestamp: new Date().toISOString(),
    });
    navigate("/chat");
  };

  const handleRegister = async () => {
    const errors: Record<string, string> = {};
    if (!regId.trim()) errors.id = "Employee ID is required";
    else if (!/^\d+$/.test(regId)) errors.id = "Employee ID must be numeric";
    if (!regName.trim()) errors.name = "Full name is required";
    if (!regProject.trim()) errors.project = "Project name is required";
    setRegErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const user = await registerUser(regId.trim(), regName.trim(), regProject.trim());
      saveSession({
        name: user.fullName,
        employeeId: user.employeeId,
        projectName: user.projectName,
        loginTimestamp: new Date().toISOString(),
      });
      navigate("/chat");
    } catch (e: unknown) {
      setRegErrors({ id: (e as Error).message });
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-[45%] gradient-brand flex-col justify-between p-12 text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-64 h-64 border border-primary-foreground/20 rounded-full" />
          <div className="absolute bottom-32 right-8 w-48 h-48 border border-primary-foreground/20 rounded-full" />
          <div className="absolute top-1/2 left-1/3 w-32 h-32 border border-primary-foreground/20 rounded-full" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <Monitor className="w-8 h-8" />
            <span className="text-2xl font-semibold tracking-tight">Dell Compact</span>
          </div>
          <p className="text-sm opacity-80 font-mono">RAG Gateway v2.0</p>
        </div>

        <div className="relative z-10 space-y-8">
          <h1 className="text-4xl font-bold leading-tight">
            Intelligent Document
            <br />
            Retrieval & Generation
          </h1>
          <div className="space-y-4">
            <Feature icon={<Zap className="w-5 h-5" />} title="Compression Engine" desc="Up to 85% token reduction with semantic preservation" />
            <Feature icon={<Shield className="w-5 h-5" />} title="Smart Caching" desc="Cosine similarity matching with 0.85 threshold" />
          </div>
        </div>

        <p className="relative z-10 text-xs opacity-60 font-mono">
          © 2026 Dell Technologies. Internal Use Only.
        </p>
      </div>

      {/* Right panel - auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <Monitor className="w-7 h-7 text-primary" />
            <span className="text-xl font-semibold tracking-tight">Dell Compact</span>
            <span className="text-xs font-mono text-muted-foreground ml-auto">RAG Gateway</span>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-6 mt-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
                <p className="text-muted-foreground mt-1">Enter your Employee ID to access the gateway</p>
              </div>
              <div className="space-y-5">
                <Field label="Employee ID" error={loginErrors.id}>
                  <Input
                    placeholder="100234"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    className={loginErrors.id ? "border-destructive" : ""}
                    inputMode="numeric"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </Field>
                <Button onClick={handleLogin} className="w-full h-11 text-sm font-medium">
                  Login
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="register" className="space-y-6 mt-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Register</h2>
                <p className="text-muted-foreground mt-1">Create a new account to get started</p>
              </div>
              <div className="space-y-5">
                <Field label="Employee ID" error={regErrors.id}>
                  <Input
                    placeholder="100234"
                    value={regId}
                    onChange={(e) => setRegId(e.target.value)}
                    className={regErrors.id ? "border-destructive" : ""}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Full Name" error={regErrors.name}>
                  <Input
                    placeholder="Jane Doe"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className={regErrors.name ? "border-destructive" : ""}
                  />
                </Field>
                <Field label="Project Name" error={regErrors.project}>
                  <Input
                    placeholder="Enterprise Knowledge Base"
                    value={regProject}
                    onChange={(e) => setRegProject(e.target.value)}
                    className={regErrors.project ? "border-destructive" : ""}
                    onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                  />
                </Field>
                <Button onClick={handleRegister} className="w-full h-11 text-sm font-medium">
                  Register & Login
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-center text-muted-foreground font-mono">
            Secure access · All activity is logged
          </p>
        </div>
      </div>
    </div>
  );
};

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="mt-0.5 opacity-80">{icon}</div>
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs opacity-70">{desc}</p>
      </div>
    </div>
  );
}

export default Login;
