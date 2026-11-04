import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, clearSession, saveTokens, messageOf } from "./api";
import { TokensSchema, UserSchema, type User } from "./types";
type Auth = {
  user: User | null;
  loading: boolean;
  error: string;
  signIn: (
    username: string,
    password: string,
    register: boolean,
  ) => Promise<void>;
  signOut: () => void;
};
const AuthContext = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!sessionStorage.getItem("pulse.access")) {
      setLoading(false);
      return;
    }
    void api("me/", UserSchema)
      .then((u) => {
        if (active) setUser(u);
      })
      .catch((e) => {
        if (active) {
          clearSession();
          setError(messageOf(e));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function signIn(username: string, password: string, register: boolean) {
    setError("");
    if (register)
      await api("register/", UserSchema, { username, password }, false);
    const tokens = await api(
      "token/",
      TokensSchema,
      { username, password },
      false,
    );
    saveTokens(tokens);
    setUser(await api("me/", UserSchema));
  }
  function signOut() {
    clearSession();
    setUser(null);
  }
  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider required");
  return context;
}
