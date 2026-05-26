import React, { useEffect, useState } from "react";
import ShopCartItem from "../../component/ShopCart/ShopCartItem";
import { useSelector, useDispatch } from "react-redux";
import { getItemCartStart } from "../../action/ShopCartAction";
import "./ShopCartPage.scss";
import { toast } from "react-toastify";
import CommonUtils from "../../utils/CommonUtils";

function ShopCartPage(props) {
    const dispatch = useDispatch();
    const [user, setuser] = useState();
    let dataCart = useSelector((state) => state.shopcart.listCartItem);

    useEffect(() => {
        const userData = JSON.parse(localStorage.getItem("userData"));
        setuser(userData);
        if (userData) {
            dispatch(getItemCartStart(userData.id));
        } else {
            toast.error("Hãy đăng nhập để mua hàng");
        }
    }, []);

    let price = 0;

    return (
        <section className="cart_area">
            <div className="container">
                <div className="cart_inner">
                    <div className="table-responsive">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th scope="col">Sản phẩm</th>
                                    <th scope="col">Giá</th>
                                    <th
                                        style={{ textAlign: "center" }}
                                        scope="col"
                                    >
                                        Số lượng
                                    </th>
                                    <th
                                        style={{ textAlign: "center" }}
                                        scope="col"
                                    >
                                        Tổng tiền
                                    </th>
                                    <th scope="col">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dataCart &&
                                    dataCart.length > 0 &&
                                    dataCart.map((item, index) => {
                                        price +=
                                            item.quantity *
                                            item.productdetailsizeData.productDetail.discountPrice;

                                        let name = `${item.productData.name} - ${item.productdetailsizeData.productDetail.nameDetail} - ${item.productdetailsizeData.sizeData.value}`;
                                        return (
                                            <ShopCartItem
                                                isOrder={false}
                                                id={item.id}
                                                userId={user && user.id}
                                                productdetailsizeId={
                                                    item.productdetailsizeData
                                                        .id
                                                }
                                                key={index}
                                                name={name}
                                                price={
                                                    item.productdetailsizeData
                                                        .productDetail
                                                        .discountPrice
                                                }
                                                quantity={item.quantity}
                                                image={
                                                    item.productDetailImage[0]
                                                        .image
                                                }
                                            />
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="box-shopcart-bottom">
                    <div className="content-right">
                        <div className="wrap-price">
                            <span className="text-total">
                                Tổng thanh toán ({dataCart && dataCart.length}{" "}
                                sản phẩm):{" "}
                            </span>
                            <span className="text-price">
                                {CommonUtils.formatter.format(price)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default ShopCartPage;
