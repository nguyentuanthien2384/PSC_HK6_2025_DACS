import { useDispatch, useSelector } from "react-redux";
import { loginThunk, registerThunk } from "../features/auth/authThunks";
import { clearAuth } from "../features/auth/authSlice";

const useAuth = () => {
  const dispatch = useDispatch();
  const auth = useSelector((state) => state.auth);

  const login = (payload) => dispatch(loginThunk(payload));
  const register = (payload) => dispatch(registerThunk(payload));
  const logout = () => dispatch(clearAuth());

  return {
    ...auth,
    login,
    register,
    logout,
  };
};

export default useAuth;
