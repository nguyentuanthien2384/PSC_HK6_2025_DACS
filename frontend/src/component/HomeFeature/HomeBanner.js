import React from "react";

import "./HomeBanner.scss";
import { Link } from "react-router-dom";
function HomeBanner(props) {
    return (
        <section className="home_banner_area mb-40">
            <div className="box-banner">
                <img className="box-banner__image" src={props.image} alt="" width="1600" height="600" loading={props.priority ? 'eager' : 'lazy'} fetchPriority={props.priority ? 'high' : 'low'} decoding="async" />
                <div className="banner_inner d-flex align-items-center">
                    <div className="container">
                        <div className="banner_content row">
                            <div className="col-lg-12">
                                <p className="sub text-uppercase">
                                    {props.name}
                                </p>
                                <h3>
                                    <span>Show</span> Your <br />
                                    Personal <span>Style</span>
                                </h3>
                                <h4>Hãy đến với cửa hàng chúng tôi</h4>
                                <Link className="main_btn mt-40" to={"/shop"}>
                                    Đến cửa hàng ngay
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default HomeBanner;
