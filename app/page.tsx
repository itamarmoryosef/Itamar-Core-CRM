import { redirect } from "next/navigation";

export default function RootPage() {
  // זה ישלח כל מי שנכנס ישר לדף ההתחברות
  redirect("/login");
}
