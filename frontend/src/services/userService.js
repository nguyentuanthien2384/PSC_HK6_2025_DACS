import axios from "../axios";

//==================USER==========================//
const createNewUser = (data) => {
    return axios.post(`/api/create-new-user`, data)
}
const handleLoginService = (data) => {
    return axios.post(`/api/login`, data)
}
const checkPhonenumberEmail = (data) => {
    return axios.get(`/api/check-phonenumber-email?phonenumber=${data.phonenumber}&email=${data.email}`)
}
const getDetailUserById = (id) => {
    return axios.get(`/api/get-detail-user-by-id?id=${id}`)
}

//===============ALL CODE========================//
const getAllCodeService = (type) => {
    return axios.get(`/api/get-all-code?type=${type}`)
}

//==================PRODUCT==========================//
const getAllProductUser = (data) => {
    return axios.get(`/api/get-all-product-user?limit=${data.limit}&offset=${data.offset}&sortPrice=${data.sortPrice}&sortName=${data.sortName}&categoryId=${data.categoryId}&brandId=${data.brandId}&keyword=${data.keyword}`)
}
const getDetailProductByIdService = (id) => {
    return axios.get(`/api/get-detail-product-by-id?id=${id}`)
}
const getAllProductDetailByIdService = (data) => {
    return axios.get(`/api/get-all-product-detail-by-id?id=${data.id}&limit=${data.limit}&offset=${data.offset}`)
}
const getAllProductDetailImageByIdService = (data) => {
    return axios.get(`/api/get-all-product-detail-image-by-id?id=${data.id}&limit=${data.limit}&offset=${data.offset}`)
}
const getAllProductDetailSizeByIdService = (data) => {
    return axios.get(`/api/get-all-product-detail-size-by-id?id=${data.id}&limit=${data.limit}&offset=${data.offset}`)
}
const getProductDetailByIdService = (id) => {
    return axios.get(`/api/get-product-detail-by-id?id=${id}`)
}
const getProductFeatureService = (limit) => {
    return axios.get(`/api/get-product-feature?limit=${limit}`)
}
const getProductNewService = (limit) => {
    return axios.get(`/api/get-product-new?limit=${limit}`)
}
const getProductShopcartService = (data) => {
    return axios.get(`/api/get-product-shopcart?userId=${data.userId}&limit=${data.limit}`)
}
const getProductRecommendService = (data) => {
    return axios.get(`/api/get-product-recommend?userId=${data.userId}&limit=${data.limit}`)
}

//========================SHOPCART===================//
const addShopCartService = (data) => {
    return axios.post(`/api/add-shopcart`, data)
}
const getAllShopCartByUserIdService = (id) => {
    return axios.get(`/api/get-all-shopcart-by-userId?id=${id}`)
}
const deleteItemShopCartService = (data) => {
    return axios.delete(`/api/delete-item-shopcart`, data)
}

export {
    createNewUser, handleLoginService, checkPhonenumberEmail, getDetailUserById,
    getAllCodeService,
    getAllProductUser, getDetailProductByIdService, getAllProductDetailByIdService,
    getAllProductDetailImageByIdService, getAllProductDetailSizeByIdService,
    getProductDetailByIdService, getProductFeatureService, getProductNewService,
    getProductShopcartService, getProductRecommendService,
    addShopCartService, getAllShopCartByUserIdService, deleteItemShopCartService
}
