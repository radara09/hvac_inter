import { useCallback, useState } from "react";
import type { SignupFormValues } from "../types";

const DEFAULT_LOGIN_FORM = { username: "", password: "" };
const DEFAULT_SIGNUP_FORM: SignupFormValues = {
    email: "",
    username: "",
    displayUsername: "",
    password: "",
    confirmPassword: "",
    name: "",
};

export function useAuthForms() {
    const [loginForm, setLoginForm] = useState(DEFAULT_LOGIN_FORM);
    const [signUpForm, setSignUpForm] = useState<SignupFormValues>(DEFAULT_SIGNUP_FORM);
    const [authMode, setAuthMode] = useState<"login" | "register">("login");

    const resetLoginForm = useCallback(() => setLoginForm(DEFAULT_LOGIN_FORM), []);
    const resetSignUpForm = useCallback(() => setSignUpForm(DEFAULT_SIGNUP_FORM), []);
    const toggleAuthMode = useCallback(() => {
        setAuthMode(mode => (mode === "login" ? "register" : "login"));
    }, []);

    return {
        authMode,
        loginForm,
        resetLoginForm,
        resetSignUpForm,
        setAuthMode,
        setLoginForm,
        setSignUpForm,
        signUpForm,
        toggleAuthMode,
    };
}
