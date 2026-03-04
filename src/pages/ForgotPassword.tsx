import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, Mail, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const ForgotPassword = () => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
      toast.success("Email đặt lại mật khẩu đã được gửi");
    } catch (err: any) {
      toast.error(err.message || "Gửi email thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary glow-primary mx-auto">
            <Bot className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Quên mật khẩu</h1>
          <p className="text-sm text-muted-foreground">Nhập email để nhận link đặt lại mật khẩu</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">📧 Đã gửi email đặt lại mật khẩu tới <strong>{email}</strong>. Vui lòng kiểm tra hộp thư.</p>
            <Link to="/login" className="text-primary hover:underline text-sm font-medium">← Quay lại đăng nhập</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" className="pl-10 h-10" required />
              </div>
            </div>
            <Button type="submit" className="w-full glow-primary" disabled={loading}>
              {loading ? "Đang gửi..." : "Gửi email đặt lại"}
            </Button>
            <Link to="/login" className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Quay lại đăng nhập
            </Link>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
