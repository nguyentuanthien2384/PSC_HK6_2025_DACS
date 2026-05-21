import axios from "../axios";

const getAllProductApi = () => {
  return axios.get("/api/products");
};

const getDetailProductApi = (id) => {
  return axios.get(`/api/products/detail?id=${id}`);
};

export { getAllProductApi, getDetailProductApi };
