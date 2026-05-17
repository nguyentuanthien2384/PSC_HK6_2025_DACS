import axios from "axios";
import _ from "lodash";

const instance = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL,

  //  withCredentials: true
});
if (localStorage.getItem("token")) {
  instance.interceptors.request.use(
    (config) => {
      config.headers.authorization =
        "Bearer " + localStorage.getItem("token").replaceAll('"', "");

      return config;
    },
    (error) => {
      return Promise.reject(error);
    },
  );
}

instance.interceptors.response.use((response) => {
  const { data } = response;
  return response.data;
});

export default instance;
