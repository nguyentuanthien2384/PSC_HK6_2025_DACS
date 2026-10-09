import { getUser } from "../../utils/token";
import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    getDetailProductByIdService,
    getProductRecommendService,
} from "../../services/userService";
import InfoDetailProduct from "../../component/Product/InfoDetailProduct";
import ProfileProduct from "../../component/Product/ProfileProduct";
import DescriptionProduct from "../../component/Product/DescriptionProduct";
import ProductFeature from "../../component/HomeFeature/ProductFeature";
import ReviewProduct from "../../component/Product/ReviewProduct";
import { toast } from "react-toastify";
function DetailProductPage(props) {
    const [dataProduct, setDataProduct] = useState({});
    const [dataDetailSize, setdataDetailSize] = useState({});
    const { id } = useParams();
    const [user, setUser] = useState({});
    const [dataProductRecommend, setdataProductRecommend] = useState([]);
    const [loadError, setLoadError] = useState("");
    useEffect(() => {
        const userData = getUser();
        if (userData) {
            fetchProductFeature(userData.id).catch((error) => toast.error(error.message));
            setUser(userData);
        }

        window.scrollTo(0, 0);

        setDataProduct({}); setLoadError("");
        fetchDetailProduct().catch((error) => setLoadError(error.message));
    }, [id]);
    let sendDataFromInforDetail = (data) => {
        setdataDetailSize(data);
    };
    let fetchDetailProduct = async () => {
        let res = await getDetailProductByIdService(id);
        if (res && res.errCode === 0) {
            if (!res.data) throw new Error("Không tìm thấy sản phẩm");
            setDataProduct(res.data);
        } else {
            throw new Error(res.errMessage || "Không tìm thấy sản phẩm");
        }
    };
    let fetchProductFeature = async (userId) => {
        let res = await getProductRecommendService({
            limit: 20,
            userId: userId,
        });
        if (res && res.errCode === 0) {
            setdataProductRecommend(res.data);
        }
    };
    return (
        <div>
            <section className="banner_area">
                <div className="banner_inner d-flex align-items-center">
                    <div className="container">
                        <div className="banner_content d-md-flex justify-content-between align-items-center">
                            <div className="mb-3 mb-md-0">
                                <h2>Chi tiết sản phẩm</h2>
                                <p>Thông số chi tiết về sản phẩm</p>
                            </div>
                            <div className="page_link">
                                <Link to={"/"}>Trang chủ</Link>
                                <Link to={"/shop"}>Cửa hàng</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <div className="product_image_area">
                <div className="container">
                    {loadError && <p role="alert">{loadError}</p>}
                    <InfoDetailProduct
                        userId={user && user.id ? user.id : ""}
                        dataProduct={dataProduct}
                        sendDataFromInforDetail={sendDataFromInforDetail}
                    >
                        {" "}
                    </InfoDetailProduct>
                </div>
            </div>
            <section className="product_description_area">
                <div className="container">
                    <ul className="nav nav-tabs" id="myTab" role="tablist">
                        <li className="nav-item">
                            <a
                                className="nav-link active"
                                id="profile-tab"
                                data-toggle="tab"
                                href="#profile"
                                role="tab"
                                aria-controls="profile"
                                aria-selected="false"
                            >
                                Thông số chi tiết
                            </a>
                        </li>
                        <li className="nav-item">
                            <a
                                className="nav-link "
                                id="home-tab"
                                data-toggle="tab"
                                href="#home"
                                role="tab"
                                aria-controls="home"
                                aria-selected="true"
                            >
                                Mô tả chi tiết
                            </a>
                        </li>

                        <li className="nav-item">
                            <a
                                className="nav-link"
                                id="review-tab"
                                data-toggle="tab"
                                href="#review"
                                role="tab"
                                aria-controls="review"
                                aria-selected="false"
                            >
                                Đánh giá
                            </a>
                        </li>
                    </ul>
                    <div className="tab-content" id="myTabContent">
                        <div
                            className="tab-pane fade show active"
                            id="profile"
                            role="tabpanel"
                            aria-labelledby="profile-tab"
                        >
                            <ProfileProduct data={dataDetailSize} />
                        </div>
                        <div
                            className="tab-pane fade "
                            id="home"
                            role="tabpanel"
                            aria-labelledby="home-tab"
                        >
                            <DescriptionProduct
                                data={dataProduct.contentHTML}
                            />
                        </div>

                        <div
                            className="tab-pane fade"
                            id="review"
                            role="tabpanel"
                            aria-labelledby="review-tab"
                        >
                            <ReviewProduct productId={id} userId={user?.id} />
                        </div>
                    </div>
                </div>
                {user &&
                    dataProductRecommend &&
                    dataProductRecommend.length > 0 && (
                        <ProductFeature
                            title={"Sản phẩm bạn quan tâm"}
                            data={dataProductRecommend}
                        ></ProductFeature>
                    )}
            </section>
        </div>
    );
}

export default DetailProductPage;
