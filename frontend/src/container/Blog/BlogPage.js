import React, { useEffect, useState } from "react";
import ItemBlog from "../../component/Blog/ItemBlog";
import RightBlog from "../../component/Blog/RightBlog";
import { PAGINATION } from "../../utils/constant";
import { getAllBlog } from "../../services/userService";
import ReactPaginate from "react-paginate";
import {
    getAllCategoryBlogService,
    getFeatureBlog,
} from "../../services/userService";
import { Link } from "react-router-dom";
function BlogPage(props) {
    const [dataBlog, setdataBlog] = useState([]);
    const [dataFeatureBlog, setdataFeatureBlog] = useState([]);
    const [dataSubject, setdataSubject] = useState([]);
    const [count, setCount] = useState(0);
    const [numberPage, setnumberPage] = useState(0);
    const [subjectId, setsubjectId] = useState("");
    const [keyword, setkeyword] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        getAllCategoryBlogService('SUBJECT', { signal: controller.signal })
            .then(response => { if (active && response?.errCode === 0) setdataSubject(response.data || []); })
            .catch(() => {});
        getFeatureBlog(6, { signal: controller.signal })
            .then(response => { if (active && response?.errCode === 0) setdataFeatureBlog(response.data || []); })
            .catch(() => {});
        return () => { active = false; controller.abort(); };
    }, []);

    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        setLoading(true);
        setError('');
        getAllBlog({ subjectId, keyword, limit: PAGINATION.pagerow,
            offset: numberPage * PAGINATION.pagerow, signal: controller.signal })
            .then(response => {
                if (!active) return;
                if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải bài viết.');
                setdataBlog(Array.isArray(response.data) ? response.data : []);
                setCount(Math.ceil((Number(response.count) || 0) / PAGINATION.pagerow));
            })
            .catch(failure => { if (active) setError(failure.message); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; controller.abort(); };
    }, [numberPage, subjectId, keyword, retry]);

    const handleChangePage = ({ selected }) => setnumberPage(selected);
    let handleClickCategory = (code) => {
        setnumberPage(0);
        setsubjectId(code);
        setkeyword('');
    };
    let handleSearchBlog = (text) => {
        setnumberPage(0);
        setkeyword(text.trim());
    };
    let handleOnchangeSearch = (keyword) => {
        if (keyword === "") {
            setnumberPage(0);
            setkeyword('');
        }
    };
    return (
        <>
            <section className="banner_area">
                <div className="banner_inner d-flex align-items-center">
                    <div className="container">
                        <div className="banner_content d-md-flex justify-content-between align-items-center">
                            <div className="mb-3 mb-md-0">
                                <h2>Tin tức</h2>
                                <p>
                                    Hãy theo dõi những bài viết để nhận được
                                    thông tin mới nhất
                                </p>
                            </div>
                            <div className="page_link">
                                <Link to={"/"}>Trang chủ</Link>
                                <Link to={"/blog"}>Tin tức</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <section className="blog_area section_gap">
                <div className="container">
                    <div className="row">
                        <div className="col-lg-8 mb-5 mb-lg-0">
                            <div className="blog_left_sidebar" aria-busy={loading}>
                                {loading && <p role="status">Đang tải bài viết…</p>}
                                {error && <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></p>}
                                {!loading && !error && !dataBlog.length && <p>Không tìm thấy bài viết phù hợp.</p>}
                                {dataBlog &&
                                    dataBlog.length > 0 &&
                                    dataBlog.map((item) => {
                                        return (
                                            <ItemBlog
                                                key={item.id}
                                                data={item}
                                            ></ItemBlog>
                                        );
                                    })}
                            </div>

                            {count > 1 && <ReactPaginate
                                previousLabel={"Quay lại"}
                                nextLabel={"Tiếp"}
                                breakLabel={"..."}
                                pageCount={count}
                                forcePage={numberPage}
                                disableInitialCallback
                                marginPagesDisplayed={3}
                                containerClassName={
                                    "pagination justify-content-center"
                                }
                                pageClassName={"page-item"}
                                pageLinkClassName={"page-link"}
                                previousLinkClassName={"page-link"}
                                nextClassName={"page-item"}
                                nextLinkClassName={"page-link"}
                                breakLinkClassName={"page-link"}
                                breakClassName={"page-item"}
                                activeClassName={"active"}
                                onPageChange={handleChangePage}
                            />}
                        </div>
                        <RightBlog
                            handleOnchangeSearch={handleOnchangeSearch}
                            handleSearchBlog={handleSearchBlog}
                            dataFeatureBlog={dataFeatureBlog}
                            isPage={true}
                            handleClickCategory={handleClickCategory}
                            data={dataSubject}
                        />
                    </div>
                </div>
            </section>
        </>
    );
}

export default BlogPage;
